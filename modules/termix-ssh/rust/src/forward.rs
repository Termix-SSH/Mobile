use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::Arc;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_util::sync::CancellationToken;

use crate::session::RemoteTarget;
use crate::{Session, SshError};

/// A running forward. Stopping it closes the listener and every connection it piped.
#[derive(uniffi::Object)]
pub struct Forward {
    port: u16,
    stop: CancellationToken,
    remote: Option<(Arc<Session>, String)>,
}

#[uniffi::export(async_runtime = "tokio")]
impl Forward {
    /// The bound port: on the phone for local and dynamic forwards, on the server for remote ones.
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&self) {
        self.stop.cancel();
        if let Some((session, _)) = &self.remote {
            session.remote.lock().unwrap().remove(&(self.port as u32));
        }
    }

    /// Like `stop`, and for a remote forward also asks the server to stop listening.
    pub async fn shutdown(&self) -> Result<(), SshError> {
        self.stop();
        if let Some((session, addr)) = &self.remote
            && !session.handle.is_closed() {
                session.handle.cancel_tcpip_forward(addr.clone(), self.port as u32).await?;
            }
        Ok(())
    }
}

impl Drop for Forward {
    fn drop(&mut self) {
        self.stop.cancel();
    }
}

// Accepts until stopped; each connection runs until it ends or the forward stops.
fn serve<F, Fut>(listener: TcpListener, stop: CancellationToken, handle: F)
where
    F: Fn(TcpStream) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        loop {
            let tcp = tokio::select! {
                _ = stop.cancelled() => return,
                r = listener.accept() => match r {
                    Ok((tcp, _)) => tcp,
                    Err(_) => return,
                },
            };
            crate::no_sigpipe(&tcp);
            let conn = handle(tcp);
            let stop = stop.clone();
            tokio::spawn(async move {
                tokio::select! {
                    _ = stop.cancelled() => {}
                    _ = conn => {}
                }
            });
        }
    });
}

async fn pipe(session: &Session, tcp: TcpStream, host: String, port: u16) -> Result<(), SshError> {
    let peer = tcp.peer_addr()?;
    let channel = session
        .handle
        .channel_open_direct_tcpip(host, port as u32, peer.ip().to_string(), peer.port() as u32)
        .await?;
    let mut stream = channel.into_stream();
    let mut tcp = tcp;
    tokio::io::copy_bidirectional(&mut tcp, &mut stream).await.ok();
    Ok(())
}

const SOCKS_OK: [u8; 10] = [5, 0, 0, 1, 0, 0, 0, 0, 0, 0];

async fn socks5(session: &Session, mut tcp: TcpStream) -> Result<(), SshError> {
    let mut head = [0u8; 2];
    tcp.read_exact(&mut head).await?;
    if head[0] != 5 {
        return Err(SshError::Io { msg: "not socks5".into() });
    }
    let mut methods = vec![0u8; head[1] as usize];
    tcp.read_exact(&mut methods).await?;
    tcp.write_all(&[5, 0]).await?;

    let mut req = [0u8; 4];
    tcp.read_exact(&mut req).await?;
    let mut fail = SOCKS_OK;
    if req[1] != 1 {
        fail[1] = 7;
        tcp.write_all(&fail).await?;
        return Ok(());
    }
    let host = match req[3] {
        1 => {
            let mut a = [0u8; 4];
            tcp.read_exact(&mut a).await?;
            Ipv4Addr::from(a).to_string()
        }
        3 => {
            let mut len = [0u8; 1];
            tcp.read_exact(&mut len).await?;
            let mut name = vec![0u8; len[0] as usize];
            tcp.read_exact(&mut name).await?;
            String::from_utf8_lossy(&name).into_owned()
        }
        4 => {
            let mut a = [0u8; 16];
            tcp.read_exact(&mut a).await?;
            Ipv6Addr::from(a).to_string()
        }
        _ => return Err(SshError::Io { msg: "bad socks address".into() }),
    };
    let mut port = [0u8; 2];
    tcp.read_exact(&mut port).await?;
    let port = u16::from_be_bytes(port);

    let peer = tcp.peer_addr()?;
    match session
        .handle
        .channel_open_direct_tcpip(host, port as u32, peer.ip().to_string(), peer.port() as u32)
        .await
    {
        Ok(channel) => {
            tcp.write_all(&SOCKS_OK).await?;
            let mut stream = channel.into_stream();
            tokio::io::copy_bidirectional(&mut tcp, &mut stream).await.ok();
        }
        Err(_) => {
            fail[1] = 5;
            tcp.write_all(&fail).await?;
        }
    }
    Ok(())
}

#[uniffi::export(async_runtime = "tokio")]
impl Session {
    /// Listens on `bind_host:bind_port` and sends each connection to `remote_host:remote_port`.
    pub async fn forward_local(
        self: Arc<Self>,
        bind_host: String,
        bind_port: u16,
        remote_host: String,
        remote_port: u16,
    ) -> Result<Arc<Forward>, SshError> {
        let listener = TcpListener::bind((bind_host, bind_port)).await?;
        let port = listener.local_addr()?.port();
        let stop = CancellationToken::new();
        serve(listener, stop.clone(), move |tcp| {
            let s = self.clone();
            let host = remote_host.clone();
            async move {
                pipe(&s, tcp, host, remote_port).await.ok();
            }
        });
        Ok(Arc::new(Forward { port, stop, remote: None }))
    }

    /// A SOCKS5 proxy on `bind_host:bind_port` that opens every connection through SSH.
    pub async fn forward_dynamic(
        self: Arc<Self>,
        bind_host: String,
        bind_port: u16,
    ) -> Result<Arc<Forward>, SshError> {
        let listener = TcpListener::bind((bind_host, bind_port)).await?;
        let port = listener.local_addr()?.port();
        let stop = CancellationToken::new();
        serve(listener, stop.clone(), move |tcp| {
            let s = self.clone();
            async move {
                socks5(&s, tcp).await.ok();
            }
        });
        Ok(Arc::new(Forward { port, stop, remote: None }))
    }

    /// Asks the server to listen on `remote_bind_host:remote_port` (0 lets it pick) and sends each
    /// connection to `local_host:local_port` as seen from the phone.
    pub async fn forward_remote(
        self: Arc<Self>,
        remote_bind_host: String,
        remote_port: u16,
        local_host: String,
        local_port: u16,
    ) -> Result<Arc<Forward>, SshError> {
        let got = self.handle.tcpip_forward(remote_bind_host.clone(), remote_port as u32).await?;
        let port = if remote_port == 0 { got } else { remote_port as u32 };
        let stop = CancellationToken::new();
        self.remote
            .lock()
            .unwrap()
            .insert(port, RemoteTarget { host: local_host, port: local_port, stop: stop.clone() });
        Ok(Arc::new(Forward { port: port as u16, stop, remote: Some((self, remote_bind_host)) }))
    }
}
