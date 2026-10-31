// Production engine checks on top of the A4 scenarios: none auth, cancel, reconnect, the full SFTP set,
// streaming exec, remote forwards, proxies and port knocking. Needs the docker test servers.
mod common;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use common::serde_like::Detail;
use common::*;
use termix_ssh_core::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const TARGET: u16 = 2222;
const JUMP: u16 = 2223;

fn key_login(port: u16) -> ConnectConfig {
    let mut c = config("key", port);
    c.private_key = Some(key("id_ed25519"));
    c
}

async fn text(s: &Session, cmd: &str) -> String {
    let r = s.exec(cmd.into(), 30, 0, None).await.unwrap();
    String::from_utf8_lossy(&r.stdout).trim().to_string()
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_none_and_missing_methods() {
    let cb = Cb::new();
    let s = connect(config("nopw", TARGET), cb.clone(), None).await.unwrap();
    assert_eq!(text(&s, "whoami").await, "nopw");
    assert!(cb.rounds.lock().unwrap().is_empty());

    // A password only server and nothing to offer: the app should ask for a login.
    let mut c = config("pw", TARGET);
    c.try_keyboard = false;
    let err = connect(c, Cb::new(), None).await.err().unwrap();
    assert!(matches!(err, SshError::AuthMethodNotAvailable { .. }), "{err:?}");
    record("auth.none", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn certificate_login_does_not_fall_back() {
    let mut c = config("kp", TARGET);
    c.private_key = Some(key("id_cert"));
    c.certificate = Some(key("id_cert-cert.pub"));
    c.password = Some("termix-pass".into());
    let err = connect(c, Cb::new(), None).await.err().unwrap();
    assert!(matches!(err, SshError::Auth { .. }), "{err:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn cancel_while_waiting_on_a_prompt() {
    let token = Arc::new(CancelToken::new());
    let t = token.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        t.cancel();
    });
    let cb = Arc::new(Cb { hang: true, ..Default::default() });
    let start = Instant::now();
    let err = connect(config("kbd", TARGET), cb, Some(token)).await.err().unwrap();
    assert!(matches!(err, SshError::Cancelled), "{err:?}");
    assert!(start.elapsed() < Duration::from_secs(5));
    record("cancel.connect", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn reconnect_reuses_the_login() {
    let s = connect(key_login(TARGET), Cb::new(), None).await.unwrap();
    s.disconnect().await.unwrap();
    let again = s.reconnect(None).await.unwrap();
    assert_eq!(text(&again, "whoami").await, "key");
    again.ping(5).await.unwrap();

    let jump = connect(key_login(JUMP), Cb::new(), None).await.unwrap();
    let mut t = config("pw", 22);
    t.host = "target".into();
    t.password = Some("termix-pass".into());
    let hop = jump.clone().connect_via(t, Cb::new(), None).await.unwrap();
    hop.disconnect().await.unwrap();
    let hop = hop.reconnect(None).await.unwrap();
    assert_eq!(text(&hop, "whoami").await, "pw");
    jump.disconnect().await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(matches!(hop.reconnect(None).await, Err(SshError::Disconnected)));
}

#[tokio::test(flavor = "multi_thread")]
async fn disconnect_reports_local() {
    let cb = Cb::new();
    let s = connect(key_login(TARGET), cb.clone(), None).await.unwrap();
    s.disconnect().await.unwrap();
    for _ in 0..50 {
        if !cb.disconnects.lock().unwrap().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let kinds: Vec<_> = cb.disconnects.lock().unwrap().iter().map(|d| d.1).collect();
    assert!(kinds.iter().all(|k| *k == DisconnectKind::Local), "{kinds:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn exec_timeout_cap_and_stream() {
    let s = connect(key_login(TARGET), Cb::new(), None).await.unwrap();
    let err = s.exec("sleep 10".into(), 1, 0, None).await.err().unwrap();
    assert!(matches!(err, SshError::Timeout), "{err:?}");

    let r = s.exec("head -c 5000 /dev/zero".into(), 30, 1000, None).await.unwrap();
    assert_eq!(r.stdout.len(), 1000);
    assert!(r.truncated);

    let r = s.exec("kill -TERM $$".into(), 30, 0, None).await.unwrap();
    assert_eq!(r.exit_signal.as_deref(), Some("TERM"));

    #[derive(Default)]
    struct Sink {
        out: Mutex<Vec<u8>>,
        exit: Mutex<Option<Option<u32>>>,
    }
    impl ExecCallbacks for Sink {
        fn on_stdout(&self, data: Vec<u8>) {
            self.out.lock().unwrap().extend(data);
        }
        fn on_stderr(&self, _data: Vec<u8>) {}
        fn on_exit(&self, code: Option<u32>, _signal: Option<String>) {
            *self.exit.lock().unwrap() = Some(code);
        }
    }
    let sink = Arc::new(Sink::default());
    let h = s.exec_stream("tr a-z A-Z".into(), None, sink.clone()).await.unwrap();
    h.write(b"hello".to_vec()).await.unwrap();
    h.eof().await.unwrap();
    for _ in 0..100 {
        if sink.exit.lock().unwrap().is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert_eq!(&*sink.out.lock().unwrap(), b"HELLO");
    assert_eq!(*sink.exit.lock().unwrap(), Some(Some(0)));
    record("exec.stream", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn paused_shell_holds_back_output() {
    let s = connect(key_login(TARGET), Cb::new(), None).await.unwrap();
    let out = Arc::new(Out::default());
    let sh = s.open_shell("xterm-256color".into(), 80, 24, vec![], out.clone()).await.unwrap();
    // The quotes keep the echoed command line from matching the marker.
    sh.write(b"stty -echo; echo RE''ADY\n".to_vec()).await.unwrap();
    assert!(out.wait_for("READY", 10).await, "{}", out.text());
    sh.pause();
    let before = out.data.lock().unwrap().len();
    sh.write(b"head -c 8000000 /dev/zero | tr '\\0' x; echo; echo FLOOD_''DONE\n".to_vec()).await.unwrap();
    tokio::time::sleep(Duration::from_secs(3)).await;
    // Only what was already in flight plus one channel window may arrive while paused.
    let held = out.data.lock().unwrap().len() - before;
    assert!(held < 4_000_000, "read {held} bytes while paused");
    sh.resume();
    assert!(out.wait_for("FLOOD_DONE", 60).await);
    assert!(out.data.lock().unwrap().len() - before >= 8_000_000);
    sh.end().await.unwrap();
    record("shell.pause", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn sftp_full_set() {
    let s = connect(key_login(TARGET), Cb::new(), None).await.unwrap();
    let f = s.open_sftp().await.unwrap();
    let home = f.realpath(".".into()).await.unwrap();
    assert_eq!(home, "/home/key");
    let root = format!("{home}/b1-{}", std::process::id());
    f.remove_recursive(root.clone(), None, None).await.ok();

    f.mkdir(root.clone(), Some(0o750)).await.unwrap();
    assert_eq!(f.stat(root.clone()).await.unwrap().permissions & 0o7777, 0o750);
    f.mkdir(format!("{root}/sub"), None).await.unwrap();
    f.write_file(format!("{root}/sub/a.txt"), b"one".to_vec(), Some(0o600)).await.unwrap();
    assert_eq!(f.read_file(format!("{root}/sub/a.txt"), 100).await.unwrap(), b"one");
    assert!(f.read_file(format!("{root}/sub/a.txt"), 2).await.is_err());
    f.rename(format!("{root}/sub/a.txt"), format!("{root}/b.txt")).await.unwrap();
    f.chmod(format!("{root}/b.txt"), 0o644).await.unwrap();
    let st = f.stat(format!("{root}/b.txt")).await.unwrap();
    assert_eq!((st.size, st.permissions & 0o777, st.is_dir), (3, 0o644, false));
    assert!(st.uid.is_some());

    f.symlink(format!("{root}/link"), format!("{root}/b.txt")).await.unwrap();
    let l = f.lstat(format!("{root}/link")).await.unwrap();
    assert!(l.is_symlink, "{l:?}");
    assert_eq!(l.link_target.as_deref(), Some(format!("{root}/b.txt").as_str()));
    let listed = f.list(root.clone()).await.unwrap();
    assert!(listed.iter().any(|e| e.name == "link" && e.link_target.is_some()));
    assert!(listed.iter().any(|e| e.name == "sub" && e.is_dir));

    // Removing the tree must not follow the link into anything else.
    let gone = f.remove_recursive(root.clone(), None, None).await.unwrap();
    assert_eq!(gone, 4);
    assert!(f.stat(root).await.is_err());
    record("sftp.full", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn sftp_cancel_and_resume() {
    let s = connect(key_login(TARGET), Cb::new(), None).await.unwrap();
    let f = s.open_sftp().await.unwrap();
    let dir = std::env::temp_dir().join(format!("termix-b1-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let local = dir.join("big.bin").to_string_lossy().into_owned();

    struct CancelAfter(Arc<CancelToken>);
    impl ProgressCallback for CancelAfter {
        fn on_progress(&self, done: u64, _total: u64) {
            if done > 8 * 1024 * 1024 {
                self.0.cancel();
            }
        }
    }
    let token = Arc::new(CancelToken::new());
    let err = f
        .download("/data/big.bin".into(), local.clone(), 0, Some(Arc::new(CancelAfter(token.clone()))), Some(token))
        .await
        .err()
        .unwrap();
    assert!(matches!(err, SshError::Cancelled), "{err:?}");
    let partial = std::fs::metadata(&local).unwrap().len();
    assert!(partial > 0);

    let total = f.size("/data/big.bin".into()).await.unwrap();
    let r = f.download("/data/big.bin".into(), local.clone(), partial, None, None).await.unwrap();
    assert_eq!(r.bytes, total - partial);
    assert_eq!(std::fs::metadata(&local).unwrap().len(), total);
    let want = text(&s, "cat /data/big.sha256").await;
    let mut h = <sha2::Sha256 as sha2::Digest>::new();
    std::io::copy(&mut std::fs::File::open(&local).unwrap(), &mut h).unwrap();
    assert_eq!(hex::encode(sha2::Digest::finalize(h)), want);
    std::fs::remove_dir_all(&dir).ok();
    record("sftp.cancel+resume", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn remote_forward_and_stop() {
    let s = connect(key_login(TARGET), Cb::new(), None).await.unwrap();
    // A listener on this machine that the server reaches back to.
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let local_port = l.local_addr().unwrap().port();
    tokio::spawn(async move {
        while let Ok((mut c, _)) = l.accept().await {
            tokio::spawn(async move {
                let mut b = [0u8; 4];
                if c.read_exact(&mut b).await.is_ok() {
                    c.write_all(&b).await.ok();
                }
            });
        }
    });
    let fwd = s.clone().forward_remote("127.0.0.1".into(), 0, "127.0.0.1".into(), local_port).await.unwrap();
    assert!(fwd.port() > 0);
    let echoed = text(&s, &format!("printf ping | socat -t2 - TCP:127.0.0.1:{}", fwd.port())).await;
    assert_eq!(echoed, "ping");
    fwd.shutdown().await.unwrap();
    let after = s
        .exec(format!("printf ping | socat -t2 - TCP:127.0.0.1:{}", fwd.port()), 10, 0, None)
        .await
        .unwrap();
    assert_ne!(after.exit_code, Some(0));
    record("forward.remote", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn stopping_a_forward_closes_live_connections() {
    let s = connect(key_login(TARGET), Cb::new(), None).await.unwrap();
    let fwd = s.clone().forward_local("127.0.0.1".into(), 0, "127.0.0.1".into(), 7000).await.unwrap();
    let mut tcp = tokio::net::TcpStream::connect(("127.0.0.1", fwd.port())).await.unwrap();
    tcp.write_all(b"ping\n").await.unwrap();
    let mut buf = [0u8; 5];
    tcp.read_exact(&mut buf).await.unwrap();
    fwd.stop();
    let mut rest = vec![];
    let read = tokio::time::timeout(Duration::from_secs(3), tcp.read_to_end(&mut rest)).await;
    assert!(read.is_ok(), "connection stayed open after stop");
}

#[tokio::test(flavor = "multi_thread")]
async fn through_a_socks5_proxy_with_knocks() {
    // The jump host's dynamic forward is the SOCKS5 proxy; "target" only resolves behind it.
    let jump = connect(key_login(JUMP), Cb::new(), None).await.unwrap();
    let socks = jump.clone().forward_dynamic("127.0.0.1".into(), 0).await.unwrap();
    let mut c = config("pw", 22);
    c.host = "target".into();
    c.password = Some("termix-pass".into());
    c.proxies = vec![ProxyHop {
        kind: ProxyKind::Socks5,
        host: "127.0.0.1".into(),
        port: socks.port(),
        username: None,
        password: None,
    }];
    let s = connect(c, Cb::new(), None).await.unwrap();
    assert_eq!(text(&s, "test -f /data/big.bin && echo yes").await, "yes");

    let mut c = key_login(TARGET);
    c.port_knock = vec![
        PortKnock { port: 7001, udp: false, delay_ms: 10 },
        PortKnock { port: 7002, udp: true, delay_ms: 10 },
    ];
    connect(c, Cb::new(), None).await.unwrap();
    record("proxy.socks5+knock", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn putty_keys_convert_to_openssh() {
    for (ppk, public) in [("id_rsa.ppk", "id_rsa.pub"), ("id_ed25519.ppk", "id_ed25519.pub")] {
        let info = inspect_key(key(ppk), None).unwrap();
        assert_eq!(info.format, "ppk");
        let want = russh::keys::PublicKey::from_openssh(key(public).trim()).unwrap();
        assert_eq!(info.sha256, want.fingerprint(russh::keys::HashAlg::Sha256).to_string());
        let open = convert_key_to_openssh(key(ppk), None, None).unwrap();
        assert!(open.contains("BEGIN OPENSSH PRIVATE KEY"));
        let mut c = config("key", TARGET);
        c.private_key = Some(open);
        connect(c, Cb::new(), None).await.unwrap();
    }
    let cert = inspect_certificate(key("id_cert-cert.pub")).unwrap();
    assert_eq!(cert.principals, vec!["cert".to_string()]);
    assert!(!cert.is_host);
    record("keys.ppk", true, Detail::none());
}
