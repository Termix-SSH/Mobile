//! Termix SSH engine core. Swift and Kotlin reach it through UniFFI.

mod algorithms;
mod forward;
mod session;
mod sftp;
mod shell;

pub use forward::Forward;
pub use session::{connect, Session};
pub use sftp::Sftp;
pub use shell::{EnvVar, Shell};

uniffi::setup_scaffolding!();

#[derive(Debug, Clone, uniffi::Record)]
pub struct ConnectConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    /// OpenSSH, PEM, PKCS8 or PuTTY PPK text.
    pub private_key: Option<String>,
    pub passphrase: Option<String>,
    /// OpenSSH user certificate (`*-cert.pub` text) for `private_key`.
    pub certificate: Option<String>,
    pub force_keyboard_interactive: bool,
    pub allow_legacy_algorithms: bool,
    pub connect_timeout_secs: u32,
    pub keepalive_interval_secs: u32,
    pub keepalive_count_max: u32,
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
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub permissions: u32,
    pub mtime: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TransferResult {
    pub bytes: u64,
    pub millis: u64,
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
    #[error("Login cancelled")]
    AuthCancelled,
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
    fn on_disconnect(&self, reason: String);
}

#[uniffi::export(with_foreign)]
pub trait ShellCallbacks: Send + Sync {
    fn on_data(&self, data: Vec<u8>);
    fn on_exit(&self, exit_code: Option<u32>);
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
