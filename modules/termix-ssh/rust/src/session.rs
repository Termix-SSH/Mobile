use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::client::{self, AuthResult, DisconnectReason, KeyboardInteractiveAuthResponse, Msg};
use russh::keys::{
    decode_secret_key, Certificate, HashAlg, PrivateKey, PrivateKeyWithHashAlg,
    PublicKeyOrCertificate,
};
use russh::{Channel, MethodKind, SshId};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_util::sync::CancellationToken;
use zeroize::Zeroize;

use crate::cancel::{cancellable, CancelToken};
use crate::{
    algorithms, proxy, ConnectConfig, DisconnectKind, HostKeyInfo, KbdPrompt, KbdRequest,
    NegotiatedAlgorithms, SessionCallbacks, SshError,
};

/// Remote forwards on this connection: the port the server listens on, mapped to where we send it.
pub(crate) type RemoteForwards = Arc<Mutex<HashMap<u32, RemoteTarget>>>;

#[derive(Clone)]
pub(crate) struct RemoteTarget {
    pub host: String,
    pub port: u16,
    pub stop: CancellationToken,
}

pub(crate) struct ClientHandler {
    cb: Arc<dyn SessionCallbacks>,
    host: String,
    port: u16,
    host_key: Arc<Mutex<Option<HostKeyInfo>>>,
    names: Arc<Mutex<Option<NegotiatedAlgorithms>>>,
    remote: RemoteForwards,
    closing: Arc<AtomicBool>,
}

fn host_key_info(host: &str, port: u16, key: &PublicKeyOrCertificate) -> HostKeyInfo {
    match key {
        PublicKeyOrCertificate::PublicKey { key, .. } => HostKeyInfo {
            host: host.into(),
            port,
            key_type: key.algorithm().to_string(),
            blob_hex: hex::encode(key.to_bytes().unwrap_or_default()),
            sha256: key.fingerprint(HashAlg::Sha256).to_string(),
            is_certificate: false,
            ca_sha256: None,
            principals: vec![],
        },
        PublicKeyOrCertificate::Certificate(cert) => {
            let inner = russh::keys::PublicKey::from(cert.public_key().clone());
            let ca = russh::keys::PublicKey::from(cert.signature_key().clone());
            HostKeyInfo {
                host: host.into(),
                port,
                key_type: cert.algorithm().to_certificate_type(),
                blob_hex: hex::encode(inner.to_bytes().unwrap_or_default()),
                sha256: inner.fingerprint(HashAlg::Sha256).to_string(),
                is_certificate: true,
                ca_sha256: Some(ca.fingerprint(HashAlg::Sha256).to_string()),
                principals: cert.valid_principals().to_vec(),
            }
        }
    }
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn auth_banner(
        &mut self,
        banner: &str,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        self.cb.on_banner(banner.to_string());
        Ok(())
    }

    async fn check_server_key(
        &mut self,
        key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let info = host_key_info(&self.host, self.port, key);
        *self.host_key.lock().unwrap() = Some(info.clone());
        Ok(self.cb.verify_host_key(info).await)
    }

    async fn kex_done(
        &mut self,
        _secret: Option<&[u8]>,
        names: &russh::Names,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        *self.names.lock().unwrap() = Some(NegotiatedAlgorithms {
            kex: names.kex.as_ref().to_string(),
            host_key: names.key.to_string(),
            cipher: names.cipher.as_ref().to_string(),
            mac: names.client_mac.as_ref().to_string(),
        });
        Ok(())
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        _connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: client::ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let target = self.remote.lock().unwrap().get(&connected_port).cloned();
        // Dropping `reply` rejects a port we never asked for.
        let Some(t) = target else { return Ok(()) };
        reply.accept().await;
        tokio::spawn(async move {
            let Ok(mut tcp) = tokio::net::TcpStream::connect((t.host.as_str(), t.port)).await else {
                return;
            };
            crate::no_sigpipe(&tcp);
            let mut stream = channel.into_stream();
            tokio::select! {
                _ = t.stop.cancelled() => {}
                _ = tokio::io::copy_bidirectional(&mut tcp, &mut stream) => {}
            }
        });
        Ok(())
    }

    async fn disconnected(
        &mut self,
        reason: DisconnectReason<Self::Error>,
    ) -> Result<(), Self::Error> {
        let local = self.closing.load(Ordering::SeqCst);
        match reason {
            DisconnectReason::ReceivedDisconnect(info) => {
                let kind = if local { DisconnectKind::Local } else { DisconnectKind::Server };
                self.cb.on_disconnect(kind, format!("server closed: {}", info.message));
                Ok(())
            }
            DisconnectReason::Error(e) => {
                let kind = match &e {
                    _ if local => DisconnectKind::Local,
                    russh::Error::KeepaliveTimeout | russh::Error::InactivityTimeout => {
                        DisconnectKind::Keepalive
                    }
                    _ => DisconnectKind::Network,
                };
                self.cb.on_disconnect(kind, e.to_string());
                Err(e)
            }
        }
    }
}

/// The login config kept for `reconnect`, wiped from memory when the session goes away.
pub(crate) struct Held(ConnectConfig);

impl Drop for Held {
    fn drop(&mut self) {
        let c = &mut self.0;
        for s in [&mut c.password, &mut c.private_key, &mut c.passphrase].into_iter().flatten() {
            s.zeroize();
        }
        for p in &mut c.proxies {
            if let Some(s) = p.password.as_mut() {
                s.zeroize();
            }
        }
    }
}

#[derive(uniffi::Object)]
pub struct Session {
    pub(crate) handle: client::Handle<ClientHandler>,
    host_key: HostKeyInfo,
    algorithms: Option<NegotiatedAlgorithms>,
    cfg: Arc<Held>,
    cb: Arc<dyn SessionCallbacks>,
    parent: Option<Arc<Session>>,
    pub(crate) remote: RemoteForwards,
    closing: Arc<AtomicBool>,
}

fn client_config(cfg: &ConnectConfig) -> client::Config {
    let keepalive = (cfg.keepalive_interval_secs > 0)
        .then(|| Duration::from_secs(cfg.keepalive_interval_secs as u64));
    client::Config {
        client_id: SshId::Standard("SSH-2.0-Termix".into()),
        preferred: algorithms::preferred(cfg.allow_legacy_algorithms),
        keepalive_interval: keepalive,
        keepalive_max: cfg.keepalive_count_max as usize,
        nodelay: true,
        ..Default::default()
    }
}

pub(crate) fn load_key(text: &str, passphrase: Option<&str>) -> Result<PrivateKey, SshError> {
    match decode_secret_key(text, passphrase) {
        Ok(k) => Ok(k),
        Err(russh::keys::Error::KeyIsEncrypted) => Err(SshError::PassphraseRequired),
        Err(e) => {
            if passphrase.is_some()
                && matches!(decode_secret_key(text, None), Err(russh::keys::Error::KeyIsEncrypted))
            {
                Err(SshError::BadPassphrase)
            } else {
                Err(SshError::InvalidKey { msg: e.to_string() })
            }
        }
    }
}

fn names(methods: &russh::MethodSet) -> String {
    let list: Vec<&str> = methods.iter().map(<&str>::from).collect();
    if list.is_empty() { "none".into() } else { list.join(", ") }
}

/// Same order as ssh2 on the server: none, key, password, then keyboard-interactive.
async fn authenticate(
    handle: &mut client::Handle<ClientHandler>,
    cfg: &ConnectConfig,
    cb: &Arc<dyn SessionCallbacks>,
) -> Result<(), SshError> {
    let user = cfg.username.clone();
    let mut methods = match handle.authenticate_none(&user).await? {
        AuthResult::Success => return Ok(()),
        AuthResult::Failure { remaining_methods, .. } => remaining_methods,
    };
    let mut tried = false;
    let mut last = String::from("no methods left");

    if let Some(text) = cfg.private_key.as_deref().filter(|k| !k.trim().is_empty()) {
        // Parse first so a passphrase problem shows even when the server would refuse keys.
        let key = load_key(text, cfg.passphrase.as_deref())?;
        if methods.contains(&MethodKind::PublicKey) {
            tried = true;
            if let Some(cert_text) = cfg.certificate.as_deref().filter(|c| !c.trim().is_empty()) {
                let cert = Certificate::from_openssh(cert_text.trim())
                    .map_err(|e| SshError::InvalidKey { msg: e.to_string() })?;
                // Like core's applyCertificateAuth, a certificate login stops here.
                return match handle.authenticate_openssh_cert(&user, Arc::new(key), cert).await? {
                    AuthResult::Success => Ok(()),
                    AuthResult::Failure { .. } => {
                        Err(SshError::Auth { msg: "certificate refused".into() })
                    }
                };
            }
            let hash = handle.best_supported_rsa_hash().await?.flatten();
            match handle
                .authenticate_publickey(&user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                .await?
            {
                AuthResult::Success => return Ok(()),
                AuthResult::Failure { remaining_methods, .. } => {
                    last = format!("key refused, server allows {}", names(&remaining_methods));
                    methods = remaining_methods;
                }
            }
        }
    }

    if let Some(pw) = cfg.password.as_deref().filter(|p| !p.is_empty())
        && !cfg.force_keyboard_interactive && methods.contains(&MethodKind::Password) {
            tried = true;
            match handle.authenticate_password(&user, pw).await? {
                AuthResult::Success => return Ok(()),
                AuthResult::Failure { remaining_methods, .. } => {
                    last = format!("password refused, server allows {}", names(&remaining_methods));
                    methods = remaining_methods;
                }
            }
        }

    if cfg.try_keyboard && methods.contains(&MethodKind::KeyboardInteractive) {
        return keyboard_interactive(handle, &user, cb).await;
    }
    if tried {
        Err(SshError::Auth { msg: last })
    } else {
        Err(SshError::AuthMethodNotAvailable { msg: format!("server allows {}", names(&methods)) })
    }
}

// Every round goes to the app, which knows TOTP, push and saved passwords.
async fn keyboard_interactive(
    handle: &mut client::Handle<ClientHandler>,
    user: &str,
    cb: &Arc<dyn SessionCallbacks>,
) -> Result<(), SshError> {
    let mut round = 0u32;
    let mut reply = handle.authenticate_keyboard_interactive_start(user, None).await?;
    loop {
        match reply {
            KeyboardInteractiveAuthResponse::Success => return Ok(()),
            KeyboardInteractiveAuthResponse::Failure { .. } => {
                return Err(SshError::Auth { msg: "keyboard-interactive refused".into() });
            }
            KeyboardInteractiveAuthResponse::InfoRequest { name, instructions, prompts } => {
                let answers = if prompts.is_empty() {
                    vec![]
                } else {
                    let req = KbdRequest {
                        name,
                        instructions,
                        prompts: prompts
                            .into_iter()
                            .map(|p| KbdPrompt { prompt: p.prompt, echo: p.echo })
                            .collect(),
                        round,
                    };
                    round += 1;
                    cb.keyboard_interactive(req).await.ok_or(SshError::AuthCancelled)?
                };
                reply = handle.authenticate_keyboard_interactive_respond(answers).await?;
            }
        }
    }
}

async fn handshake<S>(
    stream: S,
    cfg: Arc<Held>,
    cb: Arc<dyn SessionCallbacks>,
    parent: Option<Arc<Session>>,
) -> Result<Arc<Session>, SshError>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let host_key = Arc::new(Mutex::new(None));
    let names = Arc::new(Mutex::new(None));
    let remote: RemoteForwards = Default::default();
    let closing = Arc::new(AtomicBool::new(false));
    let handler = ClientHandler {
        cb: cb.clone(),
        host: cfg.0.host.clone(),
        port: cfg.0.port,
        host_key: host_key.clone(),
        names: names.clone(),
        remote: remote.clone(),
        closing: closing.clone(),
    };
    let mut handle =
        match client::connect_stream(Arc::new(client_config(&cfg.0)), stream, handler).await {
            Ok(h) => h,
            Err(russh::Error::UnknownKey) => return Err(SshError::HostKeyRejected),
            Err(e) => {
                if host_key.lock().unwrap().is_some() && names.lock().unwrap().is_none() {
                    return Err(SshError::HostKeyRejected);
                }
                return Err(SshError::Connect { msg: e.to_string() });
            }
        };
    authenticate(&mut handle, &cfg.0, &cb).await?;
    let host_key = host_key.lock().unwrap().clone().ok_or(SshError::HostKeyRejected)?;
    let algorithms = names.lock().unwrap().clone();
    Ok(Arc::new(Session { handle, host_key, algorithms, cfg, cb, parent, remote, closing }))
}

async fn open(
    cfg: Arc<Held>,
    cb: Arc<dyn SessionCallbacks>,
    parent: Option<Arc<Session>>,
) -> Result<Arc<Session>, SshError> {
    let c = &cfg.0;
    let timeout = Duration::from_secs(c.connect_timeout_secs.max(1) as u64);
    let login = timeout * 4;
    let timed_out = |what: &str| SshError::Connect { msg: format!("{what} timed out") };
    match parent.clone() {
        Some(p) => {
            if p.handle.is_closed() {
                return Err(SshError::Disconnected);
            }
            let channel = tokio::time::timeout(
                timeout,
                p.handle.channel_open_direct_tcpip(c.host.clone(), c.port as u32, "127.0.0.1", 0),
            )
            .await
            .map_err(|_| timed_out("jump host channel"))??;
            tokio::time::timeout(login, handshake(channel.into_stream(), cfg, cb, parent))
                .await
                .map_err(|_| timed_out("login"))?
        }
        None => {
            proxy::knock(&c.host, &c.port_knock).await;
            let tcp = tokio::time::timeout(timeout, proxy::dial(&c.host, c.port, &c.proxies))
                .await
                .map_err(|_| timed_out("connect"))??;
            tokio::time::timeout(login, handshake(tcp, cfg, cb, None))
                .await
                .map_err(|_| timed_out("login"))?
        }
    }
}

/// Opens a connection (knocking and through proxies when set) and logs in.
#[uniffi::export(async_runtime = "tokio")]
pub async fn connect(
    config: ConnectConfig,
    callbacks: Arc<dyn SessionCallbacks>,
    cancel: Option<Arc<CancelToken>>,
) -> Result<Arc<Session>, SshError> {
    cancellable(cancel.as_deref(), open(Arc::new(Held(config)), callbacks, None)).await
}

#[uniffi::export(async_runtime = "tokio")]
impl Session {
    pub fn host_key(&self) -> HostKeyInfo {
        self.host_key.clone()
    }

    pub fn algorithms(&self) -> Option<NegotiatedAlgorithms> {
        self.algorithms.clone()
    }

    pub fn is_closed(&self) -> bool {
        self.handle.is_closed()
    }

    /// Logs in to another host through this one (a jump host hop).
    pub async fn connect_via(
        self: Arc<Self>,
        config: ConnectConfig,
        callbacks: Arc<dyn SessionCallbacks>,
        cancel: Option<Arc<CancelToken>>,
    ) -> Result<Arc<Session>, SshError> {
        cancellable(cancel.as_deref(), open(Arc::new(Held(config)), callbacks, Some(self))).await
    }

    /// Logs in again with the same config and callbacks, so the app never resends secrets.
    /// A hop reconnects through its parent, which must still be open.
    pub async fn reconnect(
        &self,
        cancel: Option<Arc<CancelToken>>,
    ) -> Result<Arc<Session>, SshError> {
        let fresh = open(self.cfg.clone(), self.cb.clone(), self.parent.clone());
        cancellable(cancel.as_deref(), fresh).await
    }

    /// Sends a keepalive and waits for the reply. Useful after the app comes back to the foreground.
    pub async fn ping(&self, timeout_secs: u32) -> Result<(), SshError> {
        let wait = Duration::from_secs(timeout_secs.max(1) as u64);
        tokio::time::timeout(wait, self.handle.send_ping())
            .await
            .map_err(|_| SshError::Timeout)??;
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), SshError> {
        self.closing.store(true, Ordering::SeqCst);
        for t in self.remote.lock().unwrap().drain() {
            t.1.stop.cancel();
        }
        if !self.handle.is_closed() {
            self.handle.disconnect(russh::Disconnect::ByApplication, "bye", "en").await?;
        }
        Ok(())
    }
}
