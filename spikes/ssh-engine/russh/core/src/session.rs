use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::client::{self, AuthResult, DisconnectReason, KeyboardInteractiveAuthResponse};
use russh::keys::{
    decode_secret_key, Certificate, HashAlg, PrivateKey, PrivateKeyWithHashAlg,
    PublicKeyOrCertificate,
};
use russh::{ChannelMsg, MethodKind, SshId};
use tokio::io::{AsyncRead, AsyncWrite};

use crate::{
    algorithms, ConnectConfig, ExecResult, HostKeyInfo, KbdPrompt, KbdRequest,
    NegotiatedAlgorithms, SessionCallbacks, SshError,
};

pub(crate) struct ClientHandler {
    cb: Arc<dyn SessionCallbacks>,
    host: String,
    port: u16,
    host_key: Arc<Mutex<Option<HostKeyInfo>>>,
    names: Arc<Mutex<Option<NegotiatedAlgorithms>>>,
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

    async fn disconnected(
        &mut self,
        reason: DisconnectReason<Self::Error>,
    ) -> Result<(), Self::Error> {
        match reason {
            DisconnectReason::ReceivedDisconnect(info) => {
                self.cb.on_disconnect(format!("server closed: {}", info.message));
                Ok(())
            }
            DisconnectReason::Error(e) => {
                self.cb.on_disconnect(e.to_string());
                Err(e)
            }
        }
    }
}

#[derive(uniffi::Object)]
pub struct Session {
    pub(crate) handle: client::Handle<ClientHandler>,
    host_key: HostKeyInfo,
    algorithms: Option<NegotiatedAlgorithms>,
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

fn load_key(cfg: &ConnectConfig, text: &str) -> Result<PrivateKey, SshError> {
    match decode_secret_key(text, cfg.passphrase.as_deref()) {
        Ok(k) => Ok(k),
        Err(russh::keys::Error::KeyIsEncrypted) => Err(SshError::PassphraseRequired),
        Err(e) => {
            if cfg.passphrase.is_some()
                && matches!(decode_secret_key(text, None), Err(russh::keys::Error::KeyIsEncrypted))
            {
                Err(SshError::BadPassphrase)
            } else {
                Err(SshError::InvalidKey { msg: e.to_string() })
            }
        }
    }
}

async fn authenticate(
    handle: &mut client::Handle<ClientHandler>,
    cfg: &ConnectConfig,
    cb: &Arc<dyn SessionCallbacks>,
) -> Result<(), SshError> {
    let user = cfg.username.clone();
    let mut last = String::from("no methods left");

    if let Some(text) = cfg.private_key.as_deref() {
        let key = load_key(cfg, text)?;
        let res = if let Some(cert_text) = cfg.certificate.as_deref() {
            let cert = Certificate::from_openssh(cert_text.trim())
                .map_err(|e| SshError::InvalidKey { msg: e.to_string() })?;
            handle.authenticate_openssh_cert(&user, Arc::new(key), cert).await?
        } else {
            let hash = handle.best_supported_rsa_hash().await?.flatten();
            handle
                .authenticate_publickey(&user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                .await?
        };
        match res {
            AuthResult::Success => return Ok(()),
            AuthResult::Failure { remaining_methods, .. } => {
                last = format!("key refused, server allows {:?}", remaining_methods);
            }
        }
    }

    if let Some(pw) = cfg.password.as_deref() {
        if !cfg.force_keyboard_interactive {
            match handle.authenticate_password(&user, pw).await? {
                AuthResult::Success => return Ok(()),
                AuthResult::Failure { remaining_methods, .. } => {
                    last = format!("password refused, server allows {:?}", remaining_methods);
                    if !remaining_methods.contains(&MethodKind::KeyboardInteractive) {
                        return Err(SshError::Auth { msg: last });
                    }
                }
            }
        }
    }

    // Keyboard-interactive: every round goes to the app, which knows TOTP, push and Warpgate.
    let mut round = 0u32;
    let mut reply = handle.authenticate_keyboard_interactive_start(&user, None).await?;
    loop {
        match reply {
            KeyboardInteractiveAuthResponse::Success => return Ok(()),
            KeyboardInteractiveAuthResponse::Failure { .. } => {
                return Err(SshError::Auth { msg: last });
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
                last = "keyboard-interactive refused".into();
                reply = handle.authenticate_keyboard_interactive_respond(answers).await?;
            }
        }
    }
}

async fn handshake<S>(
    stream: S,
    cfg: ConnectConfig,
    cb: Arc<dyn SessionCallbacks>,
) -> Result<Arc<Session>, SshError>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let host_key = Arc::new(Mutex::new(None));
    let names = Arc::new(Mutex::new(None));
    let handler = ClientHandler {
        cb: cb.clone(),
        host: cfg.host.clone(),
        port: cfg.port,
        host_key: host_key.clone(),
        names: names.clone(),
    };
    let mut handle = match client::connect_stream(Arc::new(client_config(&cfg)), stream, handler).await {
        Ok(h) => h,
        Err(russh::Error::UnknownKey) => return Err(SshError::HostKeyRejected),
        Err(e) => {
            if host_key.lock().unwrap().is_some() && names.lock().unwrap().is_none() {
                return Err(SshError::HostKeyRejected);
            }
            return Err(SshError::Connect { msg: e.to_string() });
        }
    };
    authenticate(&mut handle, &cfg, &cb).await?;
    let host_key = host_key.lock().unwrap().clone().ok_or(SshError::HostKeyRejected)?;
    let algorithms = names.lock().unwrap().clone();
    Ok(Arc::new(Session { handle, host_key, algorithms }))
}

/// Opens a TCP connection and logs in.
#[uniffi::export(async_runtime = "tokio")]
pub async fn connect(
    config: ConnectConfig,
    callbacks: Arc<dyn SessionCallbacks>,
) -> Result<Arc<Session>, SshError> {
    let timeout = Duration::from_secs(config.connect_timeout_secs.max(1) as u64);
    let addr = (config.host.clone(), config.port);
    let tcp = tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr))
        .await
        .map_err(|_| SshError::Connect { msg: "timed out".into() })?
        .map_err(|e| SshError::Connect { msg: e.to_string() })?;
    tcp.set_nodelay(true).ok();
    crate::no_sigpipe(&tcp);
    tokio::time::timeout(timeout * 4, handshake(tcp, config, callbacks))
        .await
        .map_err(|_| SshError::Connect { msg: "login timed out".into() })?
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
        &self,
        config: ConnectConfig,
        callbacks: Arc<dyn SessionCallbacks>,
    ) -> Result<Arc<Session>, SshError> {
        let channel = self
            .handle
            .channel_open_direct_tcpip(config.host.clone(), config.port as u32, "127.0.0.1", 0)
            .await?;
        let timeout = Duration::from_secs(config.connect_timeout_secs.max(1) as u64 * 4);
        tokio::time::timeout(timeout, handshake(channel.into_stream(), config, callbacks))
            .await
            .map_err(|_| SshError::Connect { msg: "login timed out".into() })?
    }

    pub async fn exec(&self, command: String) -> Result<ExecResult, SshError> {
        let mut channel = self.handle.channel_open_session().await?;
        channel.exec(true, command).await?;
        let mut out = ExecResult { stdout: vec![], stderr: vec![], exit_code: None };
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } => out.stdout.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => out.stderr.extend_from_slice(&data),
                ChannelMsg::ExitStatus { exit_status } => out.exit_code = Some(exit_status),
                ChannelMsg::Close => break,
                _ => {}
            }
        }
        Ok(out)
    }

    /// Sends a keepalive and waits for the reply. Useful after the app comes back to the foreground.
    pub async fn ping(&self) -> Result<(), SshError> {
        self.handle.send_ping().await?;
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), SshError> {
        self.handle
            .disconnect(russh::Disconnect::ByApplication, "bye", "en")
            .await?;
        Ok(())
    }
}
