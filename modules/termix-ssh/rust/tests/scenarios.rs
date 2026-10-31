mod common;

use std::time::Instant;

use common::serde_like::Detail;
use common::*;
use sha2::{Digest, Sha256};
use termix_ssh_core::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const TARGET: u16 = 2222;
const JUMP: u16 = 2223;

async fn exec_text(s: &Session, cmd: &str) -> String {
    let r = s.exec(cmd.into(), 30, 0, None).await.unwrap();
    String::from_utf8_lossy(&r.stdout).trim().to_string()
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_password() {
    let mut c = config("pw", TARGET);
    c.password = Some("termix-pass".into());
    let s = connect(c.clone(), Cb::new(), None).await.unwrap();
    assert_eq!(exec_text(&s, "whoami").await, "pw");
    c.password = Some("nope".into());
    let err = connect(c, Cb::new(), None).await.err().unwrap();
    assert!(matches!(err, SshError::Auth { .. }), "{err:?}");
    record("auth.password", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_key_types() {
    for name in ["id_ed25519", "id_rsa", "id_ecdsa256", "id_ecdsa384", "id_ecdsa521", "id_rsa.ppk", "id_ed25519.ppk"] {
        let mut c = config("key", TARGET);
        c.private_key = Some(key(name));
        let res = connect(c, Cb::new(), None).await;
        let ok = res.is_ok();
        record(&format!("auth.key.{name}"), ok, Detail::text(&format!("{:?}", res.err())));
        assert!(ok, "{name}");
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_key_passphrase() {
    for name in ["id_ed25519_pass", "id_rsa_pass"] {
        let mut c = config("key", TARGET);
        c.private_key = Some(key(name));
        let err = connect(c.clone(), Cb::new(), None).await.err().unwrap();
        assert!(matches!(err, SshError::PassphraseRequired), "{err:?}");
        c.passphrase = Some("wrong".into());
        let err = connect(c.clone(), Cb::new(), None).await.err().unwrap();
        assert!(matches!(err, SshError::BadPassphrase), "{name}: {err:?}");
        c.passphrase = Some("termix-key".into());
        connect(c, Cb::new(), None).await.unwrap();
    }
    record("auth.key.passphrase", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_key_then_password() {
    let mut c = config("kp", TARGET);
    c.private_key = Some(key("id_ed25519"));
    c.password = Some("termix-pass".into());
    connect(c, Cb::new(), None).await.unwrap();
    record("auth.key+password", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_keyboard_interactive_two_rounds() {
    let cb = Cb::new();
    connect(config("kbd", TARGET), cb.clone(), None).await.unwrap();
    let rounds = cb.rounds.lock().unwrap();
    assert_eq!(rounds.len(), 2, "{:?}", *rounds);
    assert!(rounds[1].prompts[0].prompt.to_lowercase().contains("verification"));
    assert!(!rounds[0].prompts[0].echo);
    record("auth.kbd", true, Detail::text(&format!("{} rounds", rounds.len())));
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_password_sent_through_kbd() {
    // forceKeyboardInteractive with a password user still logs in through PAM prompts.
    let mut c = config("kbd", TARGET);
    c.password = Some("termix-pass".into());
    c.force_keyboard_interactive = true;
    connect(c, Cb::new(), None).await.unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn auth_certificate() {
    let mut c = config("cert", TARGET);
    c.private_key = Some(key("id_cert"));
    let err = connect(c.clone(), Cb::new(), None).await.err();
    assert!(err.is_some(), "plain key must be refused for cert user");
    c.certificate = Some(key("id_cert-cert.pub"));
    connect(c, Cb::new(), None).await.unwrap();
    record("auth.cert", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn host_key_reported_and_rejected() {
    let mut c = config("pw", TARGET);
    c.password = Some("termix-pass".into());
    let cb = Cb::new();
    let s = connect(c.clone(), cb.clone(), None).await.unwrap();
    let info = s.host_key();
    assert!(info.is_certificate, "{info:?}");
    assert!(info.key_type.contains("cert-v01"));
    assert!(info.sha256.starts_with("SHA256:"));
    let ca = russh::keys::PublicKey::from_openssh(key("ca.pub").trim()).unwrap();
    assert_eq!(
        info.ca_sha256.as_deref(),
        Some(ca.fingerprint(russh::keys::HashAlg::Sha256).to_string().as_str())
    );
    let host = russh::keys::PublicKey::from_openssh(key("host_ed25519.pub").trim()).unwrap();
    assert_eq!(info.blob_hex, hex::encode(host.to_bytes().unwrap()));

    let cb = std::sync::Arc::new(Cb { reject: true, ..Default::default() });
    let err = connect(c, cb.clone(), None).await.err().unwrap();
    assert!(matches!(err, SshError::HostKeyRejected), "{err:?}");
    assert!(cb.rounds.lock().unwrap().is_empty());
    record("hostkey", true, Detail::text(&info.key_type));
}

#[tokio::test(flavor = "multi_thread")]
async fn shell_pty_resize_and_exec() {
    let mut c = config("key", TARGET);
    c.private_key = Some(key("id_ed25519"));
    let s = connect(c, Cb::new(), None).await.unwrap();
    let out = std::sync::Arc::new(Out::default());
    let env = vec![EnvVar { name: "LANG".into(), value: "C.UTF-8".into() }];
    let sh = s.open_shell("xterm-256color".into(), 80, 24, env, out.clone()).await.unwrap();
    sh.write(b"stty size; echo $TERM\n".to_vec()).await.unwrap();
    assert!(out.wait_for("24 80", 10).await, "{}", out.text());
    assert!(out.wait_for("xterm-256color", 5).await);
    sh.resize(120, 40).await.unwrap();
    sh.write(b"stty size\n".to_vec()).await.unwrap();
    assert!(out.wait_for("40 120", 10).await, "{}", out.text());
    sh.write(b"exit 0\n".to_vec()).await.unwrap();
    for _ in 0..100 {
        if out.exit.lock().unwrap().is_some() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert_eq!(*out.exit.lock().unwrap(), Some(Some(0)));

    let r = s.exec("echo out; echo err >&2; exit 3".into(), 30, 0, None).await.unwrap();
    assert_eq!(String::from_utf8_lossy(&r.stdout).trim(), "out");
    assert_eq!(String::from_utf8_lossy(&r.stderr).trim(), "err");
    assert_eq!(r.exit_code, Some(3));
    record("shell+exec", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn sftp_big_file_roundtrip() {
    let mut c = config("key", TARGET);
    c.private_key = Some(key("id_ed25519"));
    let s = connect(c, Cb::new(), None).await.unwrap();
    let want = exec_text(&s, "cat /data/big.sha256").await;
    let sftp = s.open_sftp().await.unwrap();
    assert!(sftp.list("/data".into()).await.unwrap().iter().any(|e| e.name == "big.bin"));

    let dir = std::env::temp_dir().join(format!("termix-sftp-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let local = dir.join("big.bin");
    let down = sftp
        .download("/data/big.bin".into(), local.to_string_lossy().into(), 0, None, None)
        .await
        .unwrap();
    let mut file = std::fs::File::open(&local).unwrap();
    let mut h = Sha256::new();
    std::io::copy(&mut file, &mut h).unwrap();
    assert_eq!(hex::encode(h.finalize()), want);

    let up = sftp
        .upload(local.to_string_lossy().into(), "/home/key/up.bin".into(), 0, None, None)
        .await
        .unwrap();
    let got = exec_text(&s, "sha256sum /home/key/up.bin | cut -d' ' -f1").await;
    assert_eq!(got, want);
    sftp.remove("/home/key/up.bin".into()).await.unwrap();
    std::fs::remove_dir_all(&dir).ok();

    let mbps = |t: &TransferResult| t.bytes as f64 / 1048576.0 / (t.millis.max(1) as f64 / 1000.0);
    record(
        "sftp.500mb",
        true,
        Detail::nums(&[("mb", down.bytes as f64 / 1048576.0), ("down_mbps", mbps(&down)), ("up_mbps", mbps(&up))]),
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn forward_local_and_socks() {
    let mut c = config("key", TARGET);
    c.private_key = Some(key("id_ed25519"));
    let s = connect(c, Cb::new(), None).await.unwrap();

    let fwd = s.clone().forward_local("127.0.0.1".into(), 0, "127.0.0.1".into(), 7000).await.unwrap();
    let mut tcp = tokio::net::TcpStream::connect(("127.0.0.1", fwd.port())).await.unwrap();
    tcp.write_all(b"ping\n").await.unwrap();
    let mut buf = [0u8; 5];
    tcp.read_exact(&mut buf).await.unwrap();
    assert_eq!(&buf, b"ping\n");
    fwd.stop();

    let socks = s.clone().forward_dynamic("127.0.0.1".into(), 0).await.unwrap();
    let mut tcp = tokio::net::TcpStream::connect(("127.0.0.1", socks.port())).await.unwrap();
    tcp.write_all(&[5, 1, 0]).await.unwrap();
    let mut hello = [0u8; 2];
    tcp.read_exact(&mut hello).await.unwrap();
    assert_eq!(hello, [5, 0]);
    let name = b"localhost";
    let mut req = vec![5, 1, 0, 3, name.len() as u8];
    req.extend_from_slice(name);
    req.extend_from_slice(&8080u16.to_be_bytes());
    tcp.write_all(&req).await.unwrap();
    let mut rep = [0u8; 10];
    tcp.read_exact(&mut rep).await.unwrap();
    assert_eq!(rep[1], 0);
    tcp.write_all(b"GET /hello.txt HTTP/1.0\r\nHost: localhost\r\n\r\n").await.unwrap();
    let mut body = String::new();
    tcp.read_to_string(&mut body).await.unwrap();
    assert!(body.contains("hello from termix"), "{body}");
    record("forward.local+socks", true, Detail::none());
}

#[tokio::test(flavor = "multi_thread")]
async fn jump_host() {
    let mut j = config("key", JUMP);
    j.private_key = Some(key("id_ed25519"));
    let jump = connect(j, Cb::new(), None).await.unwrap();
    let mut t = config("pw", 22);
    t.host = "target".into();
    t.password = Some("termix-pass".into());
    let start = Instant::now();
    let target = jump.clone().connect_via(t, Cb::new(), None).await.unwrap();
    let ms = start.elapsed().as_millis() as f64;
    // /data only exists on the target container
    assert_eq!(exec_text(&target, "test -f /data/big.bin && echo yes").await, "yes");
    let sftp = target.open_sftp().await.unwrap();
    assert!(!sftp.list("/data".into()).await.unwrap().is_empty());
    record("jump", true, Detail::nums(&[("hop_ms", ms)]));
}

#[tokio::test(flavor = "multi_thread")]
async fn algorithm_matrix() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-server/algos.json");
    let text = std::fs::read_to_string(path).unwrap();
    // Tiny parse to avoid a JSON dependency: pull out id, port and legacy per entry.
    let mut failures = vec![];
    for chunk in text.split("\"id\": ").skip(1) {
        let id = chunk.split('"').nth(1).unwrap().to_string();
        let port: u16 = chunk.split("\"port\": ").nth(1).unwrap().split(',').next().unwrap().trim().parse().unwrap();
        let legacy = chunk.split("\"legacy\": ").nth(1).unwrap().starts_with("true");
        let mut c = config("pw", port);
        c.password = Some("termix-pass".into());
        c.allow_legacy_algorithms = true;
        let res = connect(c.clone(), Cb::new(), None).await;
        let ok = res.is_ok();
        let mut detail = format!("{:?}", res.err());
        if legacy && ok {
            c.allow_legacy_algorithms = false;
            let off = connect(c, Cb::new(), None).await.is_err();
            detail = format!("blocked when legacy off: {off}");
        }
        record(&format!("algo.{id}"), ok, Detail::text(&detail));
        if !ok {
            failures.push(id);
        }
    }
    println!("unsupported: {failures:?}");
}
