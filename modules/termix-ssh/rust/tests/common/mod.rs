#![allow(dead_code)]

use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use termix_ssh_core::*;

pub fn host() -> String {
    std::env::var("SSH_TEST_HOST").unwrap_or_else(|_| "127.0.0.1".into())
}

pub fn keys_dir() -> PathBuf {
    std::env::var("SSH_TEST_KEYS")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-server/out"))
}

pub fn key(name: &str) -> String {
    std::fs::read_to_string(keys_dir().join(name)).unwrap_or_else(|e| panic!("{name}: {e}"))
}

pub fn config(user: &str, port: u16) -> ConnectConfig {
    ConnectConfig {
        host: host(),
        port,
        username: user.into(),
        password: None,
        private_key: None,
        passphrase: None,
        certificate: None,
        force_keyboard_interactive: false,
        try_keyboard: true,
        allow_legacy_algorithms: false,
        connect_timeout_secs: 10,
        keepalive_interval_secs: 30,
        keepalive_count_max: 5,
        proxies: vec![],
        port_knock: vec![],
    }
}

fn base32(s: &str) -> Vec<u8> {
    let alpha = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let (mut bits, mut val, mut out) = (0u32, 0u64, vec![]);
    for c in s.trim().bytes() {
        let i = alpha.iter().position(|&a| a == c).unwrap() as u64;
        val = (val << 5) | i;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((val >> bits) as u8);
            val &= (1 << bits) - 1;
        }
    }
    out
}

pub fn totp() -> String {
    let secret = base32(&key("totp_secret"));
    let step = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() / 30;
    let mut mac = Hmac::<sha1::Sha1>::new_from_slice(&secret).unwrap();
    mac.update(&step.to_be_bytes());
    let h = mac.finalize().into_bytes();
    let o = (h[19] & 0xf) as usize;
    let n = u32::from_be_bytes([h[o] & 0x7f, h[o + 1], h[o + 2], h[o + 3]]) % 1_000_000;
    format!("{n:06}")
}

#[derive(Default)]
pub struct Cb {
    pub reject: bool,
    pub host_keys: Mutex<Vec<HostKeyInfo>>,
    pub rounds: Mutex<Vec<KbdRequest>>,
    pub disconnects: Mutex<Vec<(Instant, DisconnectKind, String)>>,
    /// Never answers keyboard-interactive, to test cancel.
    pub hang: bool,
}

impl Cb {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }
}

#[async_trait::async_trait]
impl SessionCallbacks for Cb {
    async fn verify_host_key(&self, info: HostKeyInfo) -> bool {
        self.host_keys.lock().unwrap().push(info);
        !self.reject
    }

    async fn keyboard_interactive(&self, request: KbdRequest) -> Option<Vec<String>> {
        if self.hang {
            std::future::pending::<()>().await;
        }
        let answers = request
            .prompts
            .iter()
            .map(|p| {
                let p = p.prompt.to_lowercase();
                if p.contains("verification") { totp() } else { "termix-pass".into() }
            })
            .collect();
        self.rounds.lock().unwrap().push(request);
        Some(answers)
    }

    fn on_banner(&self, _banner: String) {}

    fn on_disconnect(&self, kind: DisconnectKind, reason: String) {
        self.disconnects.lock().unwrap().push((Instant::now(), kind, reason));
    }
}

#[derive(Default)]
pub struct Out {
    pub data: Mutex<Vec<u8>>,
    pub exit: Mutex<Option<Option<u32>>>,
}

impl ShellCallbacks for Out {
    fn on_data(&self, data: Vec<u8>) {
        self.data.lock().unwrap().extend_from_slice(&data);
    }
    fn on_exit(&self, exit_code: Option<u32>, _exit_signal: Option<String>) {
        *self.exit.lock().unwrap() = Some(exit_code);
    }
}

impl Out {
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.data.lock().unwrap()).into_owned()
    }

    pub async fn wait_for(&self, needle: &str, secs: u64) -> bool {
        let end = Instant::now() + Duration::from_secs(secs);
        while Instant::now() < end {
            if self.text().contains(needle) {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        false
    }
}

/// Appends one result line for the decision table.
pub fn record(scenario: &str, ok: bool, detail: serde_like::Detail) {
    let Ok(dir) = std::env::var("SSH_RESULTS_DIR") else { return };
    std::fs::create_dir_all(&dir).ok();
    let path = PathBuf::from(dir).join("russh-host.jsonl");
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(path).unwrap();
    writeln!(
        f,
        "{{\"engine\":\"russh\",\"platform\":\"host\",\"scenario\":\"{}\",\"ok\":{},{}}}",
        scenario,
        ok,
        detail.0
    )
    .unwrap();
}

pub mod serde_like {
    pub struct Detail(pub String);
    impl Detail {
        pub fn none() -> Self {
            Detail("\"detail\":null".into())
        }
        pub fn text(s: &str) -> Self {
            Detail(format!("\"detail\":\"{}\"", s.replace('\\', "/").replace('"', "'")))
        }
        pub fn nums(pairs: &[(&str, f64)]) -> Self {
            let body: Vec<String> = pairs.iter().map(|(k, v)| format!("\"{k}\":{v}")).collect();
            Detail(format!("\"detail\":{{{}}}", body.join(",")))
        }
    }
}
