use std::io::SeekFrom;
use std::sync::Arc;
use std::time::{Duration, Instant};

use russh_sftp::client::fs::Metadata;
use russh_sftp::client::{Config, SftpSession};
use russh_sftp::protocol::{FileAttributes, OpenFlags};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

use crate::cancel::{cancellable, CancelToken};
use crate::{FileEntry, ProgressCallback, Session, SshError, TransferResult};

const CHUNK: usize = 256 * 1024;
const PROGRESS_BYTES: u64 = 4 * 1024 * 1024;
const PROGRESS_EVERY: Duration = Duration::from_millis(250);
const S_IFMT: u32 = 0o170000;
const S_IFDIR: u32 = 0o040000;
const S_IFLNK: u32 = 0o120000;

#[derive(uniffi::Object)]
pub struct Sftp {
    inner: Arc<SftpSession>,
}

// Long work runs as one task on the runtime, so the foreign side polls once instead of per chunk.
async fn on_runtime<T: Send + 'static>(
    f: impl std::future::Future<Output = Result<T, SshError>> + Send + 'static,
) -> Result<T, SshError> {
    tokio::spawn(f).await.map_err(|e| SshError::Io { msg: e.to_string() })?
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
        Ok(Arc::new(Sftp { inner: Arc::new(inner) }))
    }
}

/// Sends progress at most every 4 MiB or 250 ms, and always at the end.
struct Progress {
    cb: Option<Arc<dyn ProgressCallback>>,
    total: u64,
    last_bytes: u64,
    last_at: Instant,
}

impl Progress {
    fn new(cb: Option<Arc<dyn ProgressCallback>>, total: u64, start: u64) -> Self {
        Self { cb, total, last_bytes: start, last_at: Instant::now() }
    }

    fn report(&mut self, done: u64) {
        let Some(cb) = &self.cb else { return };
        let due = done - self.last_bytes >= PROGRESS_BYTES || self.last_at.elapsed() >= PROGRESS_EVERY;
        if due || done == self.total {
            self.last_bytes = done;
            self.last_at = Instant::now();
            cb.on_progress(done, self.total);
        }
    }
}

fn entry(name: String, m: &Metadata, link_target: Option<String>) -> FileEntry {
    let mode = m.permissions.unwrap_or(0);
    let ft = m.file_type();
    FileEntry {
        name,
        size: m.size.unwrap_or(0),
        is_dir: ft.is_dir() || mode & S_IFMT == S_IFDIR,
        is_symlink: ft.is_symlink() || mode & S_IFMT == S_IFLNK,
        permissions: mode,
        mtime: m.mtime.unwrap_or(0),
        atime: m.atime.unwrap_or(0),
        uid: m.uid,
        gid: m.gid,
        link_target,
    }
}

fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') { format!("{dir}{name}") } else { format!("{dir}/{name}") }
}

fn base_name(path: &str) -> String {
    path.trim_end_matches('/').rsplit('/').next().unwrap_or(path).to_string()
}

// Removes a tree without following symlinks. Returns how many entries went.
async fn remove_tree(s: &SftpSession, path: String, cb: &Option<Arc<dyn ProgressCallback>>) -> Result<u64, SshError> {
    let meta = s.symlink_metadata(path.clone()).await?;
    let mode = meta.permissions.unwrap_or(0);
    if mode & S_IFMT != S_IFDIR {
        s.remove_file(path).await?;
        return Ok(1);
    }
    let mut count = 0;
    let mut stack = vec![(path, false)];
    while let Some((dir, listed)) = stack.pop() {
        if listed {
            s.remove_dir(dir).await?;
            count += 1;
            if let Some(cb) = cb {
                cb.on_progress(count, 0);
            }
            continue;
        }
        stack.push((dir.clone(), true));
        for e in s.read_dir(dir.clone()).await? {
            let child = join(&dir, &e.file_name());
            let m = e.metadata();
            if m.permissions.unwrap_or(0) & S_IFMT == S_IFDIR && !m.file_type().is_symlink() {
                stack.push((child, false));
            } else {
                s.remove_file(child).await?;
                count += 1;
                if let Some(cb) = cb {
                    cb.on_progress(count, 0);
                }
            }
        }
    }
    Ok(count)
}

#[uniffi::export(async_runtime = "tokio")]
impl Sftp {
    pub async fn list(&self, path: String) -> Result<Vec<FileEntry>, SshError> {
        let mut out = vec![];
        for e in self.inner.read_dir(path.clone()).await? {
            let name = e.file_name();
            let m = e.metadata();
            let link = if m.file_type().is_symlink() {
                self.inner.read_link(join(&path, &name)).await.ok()
            } else {
                None
            };
            out.push(entry(name, &m, link));
        }
        Ok(out)
    }

    /// Follows symlinks.
    pub async fn stat(&self, path: String) -> Result<FileEntry, SshError> {
        let m = self.inner.metadata(path.clone()).await?;
        Ok(entry(base_name(&path), &m, None))
    }

    /// Describes a symlink itself, with its target.
    pub async fn lstat(&self, path: String) -> Result<FileEntry, SshError> {
        let m = self.inner.symlink_metadata(path.clone()).await?;
        let link = if m.file_type().is_symlink() { self.inner.read_link(path.clone()).await.ok() } else { None };
        Ok(entry(base_name(&path), &m, link))
    }

    pub async fn size(&self, path: String) -> Result<u64, SshError> {
        Ok(self.inner.metadata(path).await?.size.unwrap_or(0))
    }

    /// Absolute path with `.` and `..` resolved. `.` gives the home folder.
    pub async fn realpath(&self, path: String) -> Result<String, SshError> {
        Ok(self.inner.canonicalize(path).await?)
    }

    pub async fn read_link(&self, path: String) -> Result<String, SshError> {
        Ok(self.inner.read_link(path).await?)
    }

    /// Makes `path` a link to `target`.
    pub async fn symlink(&self, path: String, target: String) -> Result<(), SshError> {
        // OpenSSH's sftp-server takes the two in reverse of the draft spec, and nearly every server is OpenSSH.
        self.inner.symlink(target, path).await?;
        Ok(())
    }

    pub async fn mkdir(&self, path: String, mode: Option<u32>) -> Result<(), SshError> {
        self.inner.create_dir(path.clone()).await?;
        if let Some(mode) = mode {
            self.chmod(path, mode).await?;
        }
        Ok(())
    }

    pub async fn rmdir(&self, path: String) -> Result<(), SshError> {
        self.inner.remove_dir(path).await?;
        Ok(())
    }

    pub async fn rename(&self, from: String, to: String) -> Result<(), SshError> {
        self.inner.rename(from, to).await?;
        Ok(())
    }

    /// Sets permission bits (like 0o644); file type bits are ignored.
    pub async fn chmod(&self, path: String, mode: u32) -> Result<(), SshError> {
        let attrs = FileAttributes { permissions: Some(mode & 0o7777), ..FileAttributes::empty() };
        self.inner.set_metadata(path, attrs).await?;
        Ok(())
    }

    pub async fn remove(&self, path: String) -> Result<(), SshError> {
        self.inner.remove_file(path).await?;
        Ok(())
    }

    /// Deletes a file or a whole folder. Symlinks are removed, never followed.
    /// Progress reports the count removed so far, with a total of 0.
    pub async fn remove_recursive(
        &self,
        path: String,
        progress: Option<Arc<dyn ProgressCallback>>,
        cancel: Option<Arc<CancelToken>>,
    ) -> Result<u64, SshError> {
        let inner = self.inner.clone();
        on_runtime(async move { cancellable(cancel.as_deref(), remove_tree(&inner, path, &progress)).await }).await
    }

    /// Reads a small file into memory. Fails when it is bigger than `max_bytes`.
    pub async fn read_file(&self, path: String, max_bytes: u64) -> Result<Vec<u8>, SshError> {
        let size = self.inner.metadata(path.clone()).await?.size.unwrap_or(0);
        if size > max_bytes {
            return Err(SshError::Sftp { msg: format!("file is {size} bytes, limit is {max_bytes}") });
        }
        let mut f = self.inner.open(path).await?;
        let mut buf = Vec::with_capacity(size as usize);
        (&mut f).take(max_bytes + 1).read_to_end(&mut buf).await?;
        if buf.len() as u64 > max_bytes {
            return Err(SshError::Sftp { msg: format!("file is over {max_bytes} bytes") });
        }
        Ok(buf)
    }

    /// Writes a whole file, replacing it. `mode` applies to new files.
    pub async fn write_file(&self, path: String, data: Vec<u8>, mode: Option<u32>) -> Result<(), SshError> {
        let flags = OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE;
        let attrs = FileAttributes { permissions: mode.map(|m| m & 0o7777), ..FileAttributes::empty() };
        let mut f = self.inner.open_with_flags_and_attributes(path, flags, attrs).await?;
        f.write_all(&data).await?;
        f.shutdown().await?;
        Ok(())
    }

    /// Streams a remote file to a local path in fixed chunks, never the whole file in memory.
    /// With `offset` > 0 it resumes: the local file is kept up to there and appended to.
    pub async fn download(
        &self,
        remote: String,
        local: String,
        offset: u64,
        progress: Option<Arc<dyn ProgressCallback>>,
        cancel: Option<Arc<CancelToken>>,
    ) -> Result<TransferResult, SshError> {
        let inner = self.inner.clone();
        on_runtime(async move {
            cancellable(cancel.as_deref(), async move {
                let start = Instant::now();
                let total = inner.metadata(remote.clone()).await?.size.unwrap_or(0);
                let offset = offset.min(total);
                let mut src = inner.open(remote).await?;
                let mut dst = tokio::fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(offset == 0)
                    .open(local)
                    .await?;
                if offset > 0 {
                    src.seek(SeekFrom::Start(offset)).await?;
                    dst.set_len(offset).await?;
                    dst.seek(SeekFrom::Start(offset)).await?;
                }
                let mut buf = vec![0u8; CHUNK];
                let mut done = offset;
                let mut p = Progress::new(progress, total, offset);
                loop {
                    let n = src.read(&mut buf).await?;
                    if n == 0 {
                        break;
                    }
                    dst.write_all(&buf[..n]).await?;
                    done += n as u64;
                    p.report(done);
                }
                dst.flush().await?;
                Ok(TransferResult { bytes: done - offset, millis: start.elapsed().as_millis() as u64 })
            })
            .await
        })
        .await
    }

    /// Streams a local file up. With `offset` > 0 it resumes into the existing remote file.
    pub async fn upload(
        &self,
        local: String,
        remote: String,
        offset: u64,
        progress: Option<Arc<dyn ProgressCallback>>,
        cancel: Option<Arc<CancelToken>>,
    ) -> Result<TransferResult, SshError> {
        let inner = self.inner.clone();
        on_runtime(async move {
            cancellable(cancel.as_deref(), async move {
                let start = Instant::now();
                let mut src = tokio::fs::File::open(local).await?;
                let total = src.metadata().await?.len();
                let offset = offset.min(total);
                let mut dst = if offset > 0 {
                    let mut f = inner
                        .open_with_flags(remote, OpenFlags::WRITE | OpenFlags::CREATE)
                        .await?;
                    f.seek(SeekFrom::Start(offset)).await?;
                    src.seek(SeekFrom::Start(offset)).await?;
                    f
                } else {
                    inner.create(remote).await?
                };
                let mut buf = vec![0u8; CHUNK];
                let mut done = offset;
                let mut p = Progress::new(progress, total, offset);
                loop {
                    let n = src.read(&mut buf).await?;
                    if n == 0 {
                        break;
                    }
                    dst.write_all(&buf[..n]).await?;
                    done += n as u64;
                    p.report(done);
                }
                dst.shutdown().await?;
                Ok(TransferResult { bytes: done - offset, millis: start.elapsed().as_millis() as u64 })
            })
            .await
        })
        .await
    }

    pub async fn shutdown(&self) -> Result<(), SshError> {
        self.inner.close().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths() {
        assert_eq!(join("/a", "b"), "/a/b");
        assert_eq!(join("/", "b"), "/b");
        assert_eq!(base_name("/a/b/"), "b");
        assert_eq!(base_name("file"), "file");
    }
}
