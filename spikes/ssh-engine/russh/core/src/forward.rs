use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::Arc;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

use crate::{Session, SshError};

#[derive(uniffi::Object)]
pub struct Forward {
    port: u16,
    task: JoinHandle<()>,
}

#[uniffi::export]
impl Forward {
    /// The local port, useful when 0 was asked for.
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&self) {
        self.task.abort();
    }
}

impl Drop for Forward {
    fn drop(&mut self) {
        self.task.abort();
    }
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
        let task = tokio::spawn(async move {
            while let Ok((tcp, _)) = listener.accept().await {
                crate::no_sigpipe(&tcp);
                let s = self.clone();
                let host = remote_host.clone();
                tokio::spawn(async move {
                    pipe(&s, tcp, host, remote_port).await.ok();
                });
            }
        });
        Ok(Arc::new(Forward { port, task }))
    }

    /// A SOCKS5 proxy on `bind_host:bind_port` that opens every connection through SSH.
    pub async fn forward_dynamic(
        self: Arc<Self>,
        bind_host: String,
        bind_port: u16,
    ) -> Result<Arc<Forward>, SshError> {
        let listener = TcpListener::bind((bind_host, bind_port)).await?;
        let port = listener.local_addr()?.port();
        let task = tokio::spawn(async move {
            while let Ok((tcp, _)) = listener.accept().await {
                crate::no_sigpipe(&tcp);
                let s = self.clone();
                tokio::spawn(async move {
                    socks5(&s, tcp).await.ok();
                });
            }
        });
        Ok(Arc::new(Forward { port, task }))
    }
}
