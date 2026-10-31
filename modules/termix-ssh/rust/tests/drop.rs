mod common;

use std::process::Command;
use std::time::{Duration, Instant};

use common::serde_like::Detail;
use common::*;
use termix_ssh_core::*;

fn docker(args: &[&str]) {
    let name = std::env::var("SSH_TEST_TARGET_CONTAINER")
        .unwrap_or_else(|_| "termix-ssh-test-target-1".into());
    let status = Command::new("docker").args(args).arg(name).status().unwrap();
    assert!(status.success());
}

// Pauses the target container so packets stop, like a phone losing signal.
#[tokio::test(flavor = "multi_thread")]
async fn keepalive_detects_dropped_network() {
    if std::env::var("SSH_TEST_DOCKER").is_err() {
        eprintln!("skipped: set SSH_TEST_DOCKER=1");
        return;
    }
    let mut c = config("key", 2222);
    c.private_key = Some(key("id_ed25519"));
    c.keepalive_interval_secs = 2;
    c.keepalive_count_max = 2;
    let cb = Cb::new();
    let s = connect(c.clone(), cb.clone(), None).await.unwrap();
    docker(&["pause"]);
    let start = Instant::now();
    while cb.disconnects.lock().unwrap().is_empty() && start.elapsed() < Duration::from_secs(30) {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let took = start.elapsed().as_secs_f64();
    docker(&["unpause"]);
    let seen = !cb.disconnects.lock().unwrap().is_empty();
    assert!(seen, "no disconnect within 30s");
    assert!(s.is_closed());
    // A fresh login works once the network is back.
    connect(c, Cb::new(), None).await.unwrap();
    record("keepalive.drop", seen, Detail::nums(&[("detect_s", took)]));
}
