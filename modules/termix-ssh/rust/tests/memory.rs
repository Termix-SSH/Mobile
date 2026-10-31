mod common;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use common::serde_like::Detail;
use common::*;
use termix_ssh_core::*;

fn rss() -> Option<u64> {
    let s = std::fs::read_to_string("/proc/self/status").ok()?;
    let line = s.lines().find(|l| l.starts_with("VmRSS:"))?;
    Some(line.split_whitespace().nth(1)?.parse::<u64>().ok()? * 1024)
}

async fn peak_during<F: std::future::Future>(f: F) -> (F::Output, f64) {
    let base = rss().unwrap_or(0);
    let peak = Arc::new(AtomicU64::new(base));
    let run = Arc::new(AtomicBool::new(true));
    let (p, r) = (peak.clone(), run.clone());
    let sampler = tokio::spawn(async move {
        while r.load(Ordering::Relaxed) {
            p.fetch_max(rss().unwrap_or(0), Ordering::Relaxed);
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    });
    let out = f.await;
    run.store(false, Ordering::Relaxed);
    sampler.await.ok();
    (out, (peak.load(Ordering::Relaxed) - base) as f64 / 1048576.0)
}

// Peak RSS growth for download and upload on their own. Linux only.
#[tokio::test(flavor = "multi_thread")]
async fn sftp_memory() {
    if rss().is_none() {
        eprintln!("skipped: no /proc");
        return;
    }
    let mut c = config("key", 2222);
    c.private_key = Some(key("id_ed25519"));
    let s = connect(c, Cb::new(), None).await.unwrap();
    let sftp = s.open_sftp().await.unwrap();
    let local = std::env::temp_dir().join("termix-mem.bin");
    let l = local.to_string_lossy().to_string();
    let (down, down_mb) = peak_during(sftp.download("/data/big.bin".into(), l.clone(), 0, None, None)).await;
    let (up, up_mb) = peak_during(sftp.upload(l.clone(), "/home/key/mem.bin".into(), 0, None, None)).await;
    down.unwrap();
    up.unwrap();
    sftp.remove("/home/key/mem.bin".into()).await.unwrap();
    std::fs::remove_file(local).ok();
    println!("peak growth: download {down_mb:.1} MB, upload {up_mb:.1} MB");
    record("sftp.memory", down_mb < 64.0 && up_mb < 64.0, Detail::nums(&[("down_mb", down_mb), ("up_mb", up_mb)]));
}
