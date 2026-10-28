//! Termix SSH engine core. Swift and Kotlin reach it through UniFFI.

mod algorithms;
mod cancel;
mod display;
mod exec;
mod forward;
mod keys;
mod proxy;
#[cfg(feature = "rdp")]
mod rdp;
#[cfg(feature = "rdp")]
mod rdp_screen;
mod remote;
mod session;
mod sftp;
mod shell;
#[cfg(feature = "telnet")]
mod telnet;
#[cfg(feature = "vnc")]
mod vnc;

pub use cancel::CancelToken;
pub use exec::ExecHandle;
pub use forward::Forward;
pub use keys::{convert_key_to_openssh, inspect_certificate, inspect_key, CertInfo, KeyInfo};
pub use session::{connect, Session};
pub use sftp::Sftp;
pub use display::{display_protocols, open_display, DisplayCallbacks, DisplayConfig, DisplayProtocol, RemoteDisplay};
pub use remote::DialConfig;
pub use shell::{EnvVar, Shell};
#[cfg(feature = "telnet")]
pub use telnet::{connect_telnet, TelnetConfig, TelnetShell};

uniffi::setup_scaffolding!();

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum ProxyKind {
    Socks4,
    Socks5,
    Http,
}

/// One proxy on the way to the host. Several make a chain, first one is dialed directly.
#[derive(Clone, uniffi::Record)]
pub struct ProxyHop {
    pub kind: ProxyKind,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PortKnock {
    pub port: u16,
    pub udp: bool,
    /// Wait after this knock, like core's default of 100 ms.
    pub delay_ms: u32,
}

#[derive(Clone, uniffi::Record)]
pub struct ConnectConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    /// OpenSSH, PEM, PKCS8 or PuTTY PPK text.
    pub private_key: Option<String>,
    pub passphrase: Option<String>,
    /// OpenSSH user certificate (`*-cert.pub` text) for `private_key`. Like core, a certificate
    /// login tries only the certificate.
    pub certificate: Option<String>,
    pub force_keyboard_interactive: bool,
    /// Ask keyboard-interactive prompts when the server offers them.
    pub try_keyboard: bool,
    pub allow_legacy_algorithms: bool,
    pub connect_timeout_secs: u32,
    pub keepalive_interval_secs: u32,
    pub keepalive_count_max: u32,
    pub proxies: Vec<ProxyHop>,
    pub port_knock: Vec<PortKnock>,
}

// Secrets never show up in logs or panic messages.
impl std::fmt::Debug for ConnectConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConnectConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("username", &self.username)
            .field("password", &self.password.as_ref().map(|_| "***"))
            .field("private_key", &self.private_key.as_ref().map(|_| "***"))
            .field("certificate", &self.certificate.is_some())
            .field("proxies", &self.proxies.len())
            .finish_non_exhaustive()
    }
}

impl std::fmt::Debug for ProxyHop {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProxyHop")
            .field("kind", &self.kind)
            .field("host", &self.host)
            .field("port", &self.port)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct HostKeyInfo {
    pub host: String,
    pub port: u16,
    /// Like `ssh-ed25519` or `ssh-ed25519-cert-v01@openssh.com`.
    pub key_type: String,
    /// Hex of the raw key blob, the format Termix stores.
    pub blob_hex: String,
    /// `SHA256:...` as OpenSSH prints it.
    pub sha256: String,
    pub is_certificate: bool,
    /// Certificate signer fingerprint, when the server sent a certificate.
    pub ca_sha256: Option<String>,
    pub principals: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct KbdPrompt {
    pub prompt: String,
    pub echo: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct KbdRequest {
    pub name: String,
    pub instructions: String,
    pub prompts: Vec<KbdPrompt>,
    /// 0 for the first round of this login.
    pub round: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NegotiatedAlgorithms {
    pub kex: String,
    pub host_key: String,
    pub cipher: String,
    pub mac: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ExecResult {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: Option<u32>,
    pub exit_signal: Option<String>,
    /// True when output went past the cap and the rest was dropped.
    pub truncated: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_symlink: bool,
    /// Full st_mode, file type bits included.
    pub permissions: u32,
    pub mtime: u32,
    pub atime: u32,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    /// Where a symlink points, filled by `list` and `lstat`.
    pub link_target: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TransferResult {
    pub bytes: u64,
    pub millis: u64,
}

/// Why a session ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum DisconnectKind {
    /// The server sent a disconnect.
    Server,
    /// Keepalive replies stopped coming.
    Keepalive,
    /// The socket broke.
    Network,
    /// This side closed it.
    Local,
}

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum SshError {
    #[error("Could not connect: {msg}")]
    Connect { msg: String },
    #[error("Host key was rejected")]
    HostKeyRejected,
    #[error("The key needs a passphrase")]
    PassphraseRequired,
    #[error("Wrong passphrase")]
    BadPassphrase,
    #[error("Invalid key: {msg}")]
    InvalidKey { msg: String },
    #[error("Login failed: {msg}")]
    Auth { msg: String },
    /// Nothing this login has fits what the server accepts.
    #[error("The server does not accept any login method we have: {msg}")]
    AuthMethodNotAvailable { msg: String },
    #[error("Login cancelled")]
    AuthCancelled,
    #[error("Cancelled")]
    Cancelled,
    #[error("Timed out")]
    Timeout,
    #[error("Channel error: {msg}")]
    Channel { msg: String },
    #[error("SFTP error: {msg}")]
    Sftp { msg: String },
    #[error("I/O error: {msg}")]
    Io { msg: String },
    #[error("Disconnected")]
    Disconnected,
}

impl From<russh::Error> for SshError {
    fn from(e: russh::Error) -> Self {
        match e {
            russh::Error::UnknownKey => SshError::HostKeyRejected,
            russh::Error::Disconnect | russh::Error::SendError | russh::Error::RecvError => {
                SshError::Disconnected
            }
            other => SshError::Channel { msg: other.to_string() },
        }
    }
}

impl From<std::io::Error> for SshError {
    fn from(e: std::io::Error) -> Self {
        SshError::Io { msg: e.to_string() }
    }
}

impl From<russh_sftp::client::error::Error> for SshError {
    fn from(e: russh_sftp::client::error::Error) -> Self {
        SshError::Sftp { msg: e.to_string() }
    }
}

/// Session level events. Prompts are async so the app can ask the user.
#[uniffi::export(with_foreign)]
#[async_trait::async_trait]
pub trait SessionCallbacks: Send + Sync {
    async fn verify_host_key(&self, info: HostKeyInfo) -> bool;
    /// Return None to cancel the login.
    async fn keyboard_interactive(&self, request: KbdRequest) -> Option<Vec<String>>;
    fn on_banner(&self, banner: String);
    fn on_disconnect(&self, kind: DisconnectKind, reason: String);
}

#[uniffi::export(with_foreign)]
pub trait ShellCallbacks: Send + Sync {
    fn on_data(&self, data: Vec<u8>);
    fn on_exit(&self, exit_code: Option<u32>, exit_signal: Option<String>);
}

#[uniffi::export(with_foreign)]
pub trait ExecCallbacks: Send + Sync {
    fn on_stdout(&self, data: Vec<u8>);
    fn on_stderr(&self, data: Vec<u8>);
    fn on_exit(&self, exit_code: Option<u32>, exit_signal: Option<String>);
}

#[uniffi::export(with_foreign)]
pub trait ProgressCallback: Send + Sync {
    fn on_progress(&self, done: u64, total: u64);
}

/// iOS kills the app on SIGPIPE when a peer closes a socket we write to, so every socket opts out.
pub(crate) fn no_sigpipe(tcp: &tokio::net::TcpStream) {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        socket2::SockRef::from(tcp).set_nosigpipe(true).ok();
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    let _ = tcp;
}

/// Engine name and version, for logs.
#[uniffi::export]
pub fn engine_version() -> String {
    format!("russh {} / termix_ssh_core {}", "0.64", env!("CARGO_PKG_VERSION"))
}
