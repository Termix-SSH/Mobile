use std::sync::Arc;
use std::time::Instant;

use russh_sftp::client::{Config, SftpSession};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::{FileEntry, ProgressCallback, Session, SshError, TransferResult};

const CHUNK: usize = 256 * 1024;
const PROGRESS_EVERY: u64 = 4 * 1024 * 1024;

#[derive(uniffi::Object)]
pub struct Sftp {
    inner: SftpSession,
}

#[uniffi::export(async_runtime = "tokio")]
impl Session {
    pub async fn open_sftp(&self) -> Result<Arc<Sftp>, SshError> {
        let channel = self.handle.channel_open_session().await?;
        channel.request_subsystem(true, "sftp").await?;
        let cfg = Config {
            max_concurrent_reads: 32,
            max_concurrent_writes: 32,
            request_timeout_secs: 30,
            ..Default::default()
        };
        let inner = SftpSession::new_with_config(channel.into_stream(), cfg).await?;
        Ok(Arc::new(Sftp { inner }))
    }
}

fn report(cb: &Option<Arc<dyn ProgressCallback>>, done: u64, total: u64, last: &mut u64) {
    if let Some(cb) = cb {
        if done - *last >= PROGRESS_EVERY || done == total {
            *last = done;
            cb.on_progress(done, total);
        }
    }
}

#[uniffi::export(async_runtime = "tokio")]
impl Sftp {
    pub async fn list(&self, path: String) -> Result<Vec<FileEntry>, SshError> {
        let mut out = vec![];
        for e in self.inner.read_dir(path).await? {
            let m = e.metadata();
            let ft = m.file_type();
            out.push(FileEntry {
                name: e.file_name(),
                size: m.size.unwrap_or(0),
                is_dir: ft.is_dir(),
                is_symlink: ft.is_symlink(),
                permissions: m.permissions.unwrap_or(0),
                mtime: m.mtime.unwrap_or(0),
            });
        }
        Ok(out)
    }

    pub async fn size(&self, path: String) -> Result<u64, SshError> {
        Ok(self.inner.metadata(path).await?.size.unwrap_or(0))
    }

    /// Streams a remote file to a local path in fixed chunks, never the whole file in memory.
    pub async fn download(
        &self,
        remote: String,
        local: String,
        progress: Option<Arc<dyn ProgressCallback>>,
    ) -> Result<TransferResult, SshError> {
        let start = Instant::now();
        let total = self.inner.metadata(remote.clone()).await?.size.unwrap_or(0);
        let mut src = self.inner.open(remote).await?;
        let mut dst = tokio::fs::File::create(local).await?;
        let mut buf = vec![0u8; CHUNK];
        let (mut done, mut last) = (0u64, 0u64);
        loop {
            let n = src.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            dst.write_all(&buf[..n]).await?;
            done += n as u64;
            report(&progress, done, total, &mut last);
        }
        dst.flush().await?;
        Ok(TransferResult { bytes: done, millis: start.elapsed().as_millis() as u64 })
    }

    pub async fn upload(
        &self,
        local: String,
        remote: String,
        progress: Option<Arc<dyn ProgressCallback>>,
    ) -> Result<TransferResult, SshError> {
        let start = Instant::now();
        let mut src = tokio::fs::File::open(local).await?;
        let total = src.metadata().await?.len();
        let mut dst = self.inner.create(remote).await?;
        let mut buf = vec![0u8; CHUNK];
        let (mut done, mut last) = (0u64, 0u64);
        loop {
            let n = src.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            dst.write_all(&buf[..n]).await?;
            done += n as u64;
            report(&progress, done, total, &mut last);
        }
        dst.shutdown().await?;
        Ok(TransferResult { bytes: done, millis: start.elapsed().as_millis() as u64 })
    }

    pub async fn remove(&self, path: String) -> Result<(), SshError> {
        self.inner.remove_file(path).await?;
        Ok(())
    }

    pub async fn close(&self) -> Result<(), SshError> {
        self.inner.close().await?;
        Ok(())
    }
}
