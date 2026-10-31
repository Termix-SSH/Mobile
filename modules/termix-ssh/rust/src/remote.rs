//! Plain byte streams to non-SSH hosts (Telnet, VNC, RDP): a direct socket, a proxy chain,
//! or a direct-tcpip channel through an SSH session already logged in.

use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncWrite};

use crate::{ProxyHop, Session, SshError};

pub(crate) trait Stream: AsyncRead + AsyncWrite + Send + Unpin {}
impl<T: AsyncRead + AsyncWrite + Send + Unpin> Stream for T {}

pub(crate) type Conn = Box<dyn Stream>;

#[derive(Clone, uniffi::Record)]
pub struct DialConfig {
    pub host: String,
    pub port: u16,
    pub proxies: Vec<ProxyHop>,
    pub connect_timeout_secs: u32,
}

impl std::fmt::Debug for DialConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DialConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("proxies", &self.proxies.len())
            .finish()
    }
}

/// Opens the stream. With `via` the SSH host dials the target, so proxies are not used.
pub(crate) async fn open(cfg: &DialConfig, via: Option<Arc<Session>>) -> Result<Conn, SshError> {
    let wait = Duration::from_secs(cfg.connect_timeout_secs.max(1) as u64);
    let dial = async {
        match via {
            Some(session) => {
                let channel = session
                    .handle
                    .channel_open_direct_tcpip(cfg.host.clone(), cfg.port as u32, "127.0.0.1", 0)
                    .await?;
                Ok::<Conn, SshError>(Box::new(channel.into_stream()))
            }
            None => {
                let tcp = crate::proxy::dial(&cfg.host, cfg.port, &cfg.proxies).await?;
                Ok(Box::new(tcp) as Conn)
            }
        }
    };
    tokio::time::timeout(wait, dial).await.map_err(|_| SshError::Timeout)?
}
