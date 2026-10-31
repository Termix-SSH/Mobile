//! Getting bytes to the host: port knocking, then a direct socket or a proxy chain.

use std::net::IpAddr;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpStream, UdpSocket};

use crate::{PortKnock, ProxyHop, ProxyKind, SshError};

const KNOCK_TIMEOUT: Duration = Duration::from_millis(1500);

fn proxy_err(msg: impl Into<String>) -> SshError {
    SshError::Connect { msg: format!("proxy: {}", msg.into()) }
}

/// Knocks like core's performPortKnocking: failures are ignored, every knock waits its delay.
pub(crate) async fn knock(host: &str, seq: &[PortKnock]) {
    for k in seq {
        if k.port == 0 {
            continue;
        }
        if k.udp {
            if let Ok(sock) = UdpSocket::bind(("0.0.0.0", 0)).await {
                let _ = tokio::time::timeout(KNOCK_TIMEOUT, sock.send_to(&[], (host, k.port))).await;
            }
        } else {
            let _ = tokio::time::timeout(KNOCK_TIMEOUT, TcpStream::connect((host, k.port))).await;
        }
        tokio::time::sleep(Duration::from_millis(k.delay_ms as u64)).await;
    }
}

async fn tcp(host: &str, port: u16) -> Result<TcpStream, SshError> {
    let s = TcpStream::connect((host, port))
        .await
        .map_err(|e| SshError::Connect { msg: e.to_string() })?;
    s.set_nodelay(true).ok();
    crate::no_sigpipe(&s);
    Ok(s)
}

/// Dials `host:port`, through every proxy in order when there are any.
pub(crate) async fn dial(host: &str, port: u16, proxies: &[ProxyHop]) -> Result<TcpStream, SshError> {
    let Some(first) = proxies.first() else {
        return tcp(host, port).await;
    };
    let mut stream = tcp(&first.host, first.port).await?;
    for (i, hop) in proxies.iter().enumerate() {
        let (h, p) = match proxies.get(i + 1) {
            Some(next) => (next.host.as_str(), next.port),
            None => (host, port),
        };
        match hop.kind {
            ProxyKind::Socks5 => socks5(&mut stream, hop, h, p).await?,
            ProxyKind::Socks4 => socks4(&mut stream, hop, h, p).await?,
            ProxyKind::Http => http_connect(&mut stream, hop, h, p).await?,
        }
    }
    Ok(stream)
}

async fn socks5(s: &mut TcpStream, hop: &ProxyHop, host: &str, port: u16) -> Result<(), SshError> {
    let creds = hop.username.as_deref().filter(|u| !u.is_empty());
    if creds.is_some() {
        s.write_all(&[5, 2, 0, 2]).await?;
    } else {
        s.write_all(&[5, 1, 0]).await?;
    }
    let mut reply = [0u8; 2];
    s.read_exact(&mut reply).await?;
    if reply[0] != 5 {
        return Err(proxy_err("not a SOCKS5 proxy"));
    }
    match reply[1] {
        0 => {}
        2 => {
            let user = creds.unwrap_or_default().as_bytes();
            let pass = hop.password.as_deref().unwrap_or_default().as_bytes();
            if user.len() > 255 || pass.len() > 255 {
                return Err(proxy_err("username or password too long"));
            }
            let mut msg = vec![1, user.len() as u8];
            msg.extend_from_slice(user);
            msg.push(pass.len() as u8);
            msg.extend_from_slice(pass);
            s.write_all(&msg).await?;
            let mut ok = [0u8; 2];
            s.read_exact(&mut ok).await?;
            if ok[1] != 0 {
                return Err(proxy_err("SOCKS5 login refused"));
            }
        }
        _ => return Err(proxy_err("SOCKS5 proxy wants a login method we don't have")),
    }

    let mut req = vec![5, 1, 0];
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(a)) => {
            req.push(1);
            req.extend_from_slice(&a.octets());
        }
        Ok(IpAddr::V6(a)) => {
            req.push(4);
            req.extend_from_slice(&a.octets());
        }
        Err(_) => {
            if host.len() > 255 {
                return Err(proxy_err("host name too long"));
            }
            req.push(3);
            req.push(host.len() as u8);
            req.extend_from_slice(host.as_bytes());
        }
    }
    req.extend_from_slice(&port.to_be_bytes());
    s.write_all(&req).await?;

    let mut head = [0u8; 4];
    s.read_exact(&mut head).await?;
    if head[1] != 0 {
        return Err(proxy_err(format!("SOCKS5 connect failed (code {})", head[1])));
    }
    let skip = match head[3] {
        1 => 4,
        4 => 16,
        3 => {
            let mut len = [0u8; 1];
            s.read_exact(&mut len).await?;
            len[0] as usize
        }
        _ => return Err(proxy_err("bad SOCKS5 reply")),
    };
    let mut rest = vec![0u8; skip + 2];
    s.read_exact(&mut rest).await?;
    Ok(())
}

async fn socks4(s: &mut TcpStream, hop: &ProxyHop, host: &str, port: u16) -> Result<(), SshError> {
    let mut req = vec![4, 1];
    req.extend_from_slice(&port.to_be_bytes());
    // SOCKS4a: 0.0.0.1 plus the name lets the proxy resolve it.
    let ip = host.parse::<std::net::Ipv4Addr>().ok();
    req.extend_from_slice(&ip.map(|a| a.octets()).unwrap_or([0, 0, 0, 1]));
    req.extend_from_slice(hop.username.as_deref().unwrap_or_default().as_bytes());
    req.push(0);
    if ip.is_none() {
        req.extend_from_slice(host.as_bytes());
        req.push(0);
    }
    s.write_all(&req).await?;
    let mut reply = [0u8; 8];
    s.read_exact(&mut reply).await?;
    if reply[1] != 0x5a {
        return Err(proxy_err(format!("SOCKS4 connect failed (code {})", reply[1])));
    }
    Ok(())
}

async fn http_connect(s: &mut TcpStream, hop: &ProxyHop, host: &str, port: u16) -> Result<(), SshError> {
    use base64_lite::encode;
    let target = if host.contains(':') { format!("[{host}]:{port}") } else { format!("{host}:{port}") };
    let mut req = format!("CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n");
    if let (Some(u), Some(p)) = (hop.username.as_deref(), hop.password.as_deref())
        && !u.is_empty() {
            req.push_str(&format!("Proxy-Authorization: Basic {}\r\n", encode(format!("{u}:{p}").as_bytes())));
        }
    req.push_str("\r\n");
    s.write_all(req.as_bytes()).await?;

    // Read the reply headers one byte at a time so no tunnel bytes get eaten.
    let mut reader = BufReader::with_capacity(1, s);
    let mut status = String::new();
    reader.read_line(&mut status).await?;
    let code = status.split_whitespace().nth(1).unwrap_or_default();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).await? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
    }
    if code != "200" {
        return Err(proxy_err(format!("HTTP proxy answered {}", status.trim())));
    }
    Ok(())
}

mod base64_lite {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn encode(input: &[u8]) -> String {
        let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
        for chunk in input.chunks(3) {
            let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
            let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
            for i in 0..4 {
                if i <= chunk.len() {
                    out.push(T[(n >> (18 - 6 * i) & 63) as usize] as char);
                } else {
                    out.push('=');
                }
            }
        }
        out
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn encodes() {
            assert_eq!(super::encode(b"user:pass"), "dXNlcjpwYXNz");
            assert_eq!(super::encode(b"a"), "YQ==");
            assert_eq!(super::encode(b"ab"), "YWI=");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    fn hop(kind: ProxyKind, port: u16, user: Option<&str>) -> ProxyHop {
        ProxyHop {
            kind,
            host: "127.0.0.1".into(),
            port,
            username: user.map(Into::into),
            password: user.map(|_| "secret".into()),
        }
    }

    // A tiny proxy that checks what the client sent and then echoes.
    async fn fake(kind: ProxyKind) -> (u16, tokio::task::JoinHandle<Vec<u8>>) {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = l.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            let (mut s, _) = l.accept().await.unwrap();
            let mut seen = vec![];
            match kind {
                ProxyKind::Socks5 => {
                    let mut b = [0u8; 4];
                    s.read_exact(&mut b).await.unwrap();
                    seen.extend_from_slice(&b);
                    s.write_all(&[5, 2]).await.unwrap();
                    let mut a = [0u8; 2];
                    s.read_exact(&mut a).await.unwrap();
                    let mut u = vec![0u8; a[1] as usize + 1];
                    s.read_exact(&mut u).await.unwrap();
                    let mut p = vec![0u8; *u.last().unwrap() as usize];
                    s.read_exact(&mut p).await.unwrap();
                    seen.extend_from_slice(&u[..u.len() - 1]);
                    seen.extend_from_slice(&p);
                    s.write_all(&[1, 0]).await.unwrap();
                    let mut r = [0u8; 5];
                    s.read_exact(&mut r).await.unwrap();
                    let mut name = vec![0u8; r[4] as usize + 2];
                    s.read_exact(&mut name).await.unwrap();
                    seen.extend_from_slice(&name);
                    s.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await.unwrap();
                }
                ProxyKind::Socks4 => {
                    let mut b = [0u8; 8];
                    s.read_exact(&mut b).await.unwrap();
                    seen.extend_from_slice(&b);
                    s.write_all(&[0, 0x5a, 0, 0, 0, 0, 0, 0]).await.unwrap();
                }
                ProxyKind::Http => {
                    let mut buf = vec![];
                    while !buf.ends_with(b"\r\n\r\n") {
                        let mut c = [0u8; 1];
                        s.read_exact(&mut c).await.unwrap();
                        buf.push(c[0]);
                    }
                    seen = buf;
                    s.write_all(b"HTTP/1.1 200 OK\r\nX: y\r\n\r\nhi").await.unwrap();
                }
            }
            let mut b = [0u8; 4];
            s.read_exact(&mut b).await.unwrap();
            s.write_all(&b).await.unwrap();
            seen
        });
        (port, task)
    }

    #[tokio::test]
    async fn socks5_with_login() {
        let (port, task) = fake(ProxyKind::Socks5).await;
        let mut s = dial("example.com", 22, &[hop(ProxyKind::Socks5, port, Some("bob"))]).await.unwrap();
        s.write_all(b"ping").await.unwrap();
        let mut b = [0u8; 4];
        s.read_exact(&mut b).await.unwrap();
        assert_eq!(&b, b"ping");
        let seen = task.await.unwrap();
        assert_eq!(&seen[..4], &[5, 2, 0, 2]);
        let text = String::from_utf8_lossy(&seen[4..]);
        assert!(text.starts_with("bobsecretexample.com"), "{text}");
    }

    #[tokio::test]
    async fn socks4a_by_name() {
        let (port, task) = fake(ProxyKind::Socks4).await;
        // The fake reads 8 bytes only, so use an IP and no user id.
        let mut s = dial("10.0.0.5", 2222, &[hop(ProxyKind::Socks4, port, None)]).await.unwrap();
        s.write_all(b"ping").await.unwrap();
        let seen = task.await.unwrap();
        assert_eq!(seen, vec![4, 1, 0x08, 0xae, 10, 0, 0, 5]);
    }

    #[tokio::test]
    async fn http_connect_keeps_tunnel_bytes() {
        let (port, task) = fake(ProxyKind::Http).await;
        let mut s = dial("host", 22, &[hop(ProxyKind::Http, port, Some("u"))]).await.unwrap();
        let mut hi = [0u8; 2];
        s.read_exact(&mut hi).await.unwrap();
        assert_eq!(&hi, b"hi");
        s.write_all(b"ping").await.unwrap();
        let seen = String::from_utf8(task.await.unwrap()).unwrap();
        assert!(seen.starts_with("CONNECT host:22 HTTP/1.1\r\n"));
        assert!(seen.contains("Proxy-Authorization: Basic dTpzZWNyZXQ=\r\n"));
    }

    #[tokio::test]
    async fn knocks_ignore_failures() {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = l.local_addr().unwrap().port();
        let seq = [
            PortKnock { port: 1, udp: false, delay_ms: 0 },
            PortKnock { port: 9, udp: true, delay_ms: 0 },
            PortKnock { port, udp: false, delay_ms: 0 },
        ];
        knock("127.0.0.1", &seq).await;
        tokio::time::timeout(Duration::from_secs(2), l.accept()).await.unwrap().unwrap();
    }
}
