use std::sync::Arc;
use std::time::Duration;

use russh::client::Msg;
use russh::ChannelWriteHalf;

use crate::cancel::{cancellable, CancelToken};
use crate::shell::{drain, parse_sig, MODES};
use crate::{ExecCallbacks, ExecResult, Session, SshError};

/// A running command whose output streams to callbacks.
#[derive(uniffi::Object)]
pub struct ExecHandle {
    writer: ChannelWriteHalf<Msg>,
}

fn push_capped(buf: &mut Vec<u8>, data: &[u8], cap: usize, truncated: &mut bool) {
    let room = cap.saturating_sub(buf.len());
    if data.len() > room {
        *truncated = true;
    }
    buf.extend_from_slice(&data[..data.len().min(room)]);
}

#[uniffi::export(async_runtime = "tokio")]
impl Session {
    /// Runs a command and collects its output. `max_bytes` caps stdout and stderr each;
    /// `timeout_secs` of 0 means no limit. The channel closes on timeout or cancel.
    pub async fn exec(
        &self,
        command: String,
        timeout_secs: u32,
        max_bytes: u64,
        cancel: Option<Arc<CancelToken>>,
    ) -> Result<ExecResult, SshError> {
        let cap = if max_bytes == 0 { usize::MAX } else { max_bytes as usize };
        let channel = cancellable(cancel.as_deref(), async {
            let channel = self.handle.channel_open_session().await?;
            channel.exec(true, command).await?;
            Ok(channel)
        })
        .await?;
        let (reader, writer) = channel.split();
        let run = async {
            let (mut out, mut err) = (vec![], vec![]);
            let (mut t_out, mut t_err) = (false, false);
            let (exit_code, exit_signal) = drain(
                reader,
                None,
                |d| push_capped(&mut out, &d, cap, &mut t_out),
                |d| push_capped(&mut err, &d, cap, &mut t_err),
            )
            .await;
            Ok(ExecResult { stdout: out, stderr: err, exit_code, exit_signal, truncated: t_out || t_err })
        };
        let limited = async {
            if timeout_secs == 0 {
                run.await
            } else {
                tokio::time::timeout(Duration::from_secs(timeout_secs as u64), run)
                    .await
                    .map_err(|_| SshError::Timeout)?
            }
        };
        let res = cancellable(cancel.as_deref(), limited).await;
        if res.is_err() {
            writer.close().await.ok();
        }
        res
    }

    /// Starts a command and streams its output. With `pty` the command gets a terminal of that size.
    pub async fn exec_stream(
        &self,
        command: String,
        pty: Option<PtySize>,
        callbacks: Arc<dyn ExecCallbacks>,
    ) -> Result<Arc<ExecHandle>, SshError> {
        let channel = self.handle.channel_open_session().await?;
        if let Some(p) = pty {
            channel.request_pty(true, &p.term, p.cols, p.rows, 0, 0, MODES).await?;
        }
        channel.exec(true, command).await?;
        let (reader, writer) = channel.split();
        tokio::spawn(async move {
            let cb = callbacks.clone();
            let (code, signal) =
                drain(reader, None, |d| callbacks.on_stdout(d), |d| cb.on_stderr(d)).await;
            cb.on_exit(code, signal);
        });
        Ok(Arc::new(ExecHandle { writer }))
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PtySize {
    pub term: String,
    pub cols: u32,
    pub rows: u32,
}

#[uniffi::export(async_runtime = "tokio")]
impl ExecHandle {
    pub async fn write(&self, data: Vec<u8>) -> Result<(), SshError> {
        self.writer.data_bytes(data).await?;
        Ok(())
    }

    /// Ends stdin, for commands that read until EOF.
    pub async fn eof(&self) -> Result<(), SshError> {
        self.writer.eof().await?;
        Ok(())
    }

    pub async fn signal(&self, name: String) -> Result<(), SshError> {
        self.writer.signal(parse_sig(&name)).await?;
        Ok(())
    }

    pub async fn end(&self) -> Result<(), SshError> {
        self.writer.close().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::push_capped;

    #[test]
    fn caps_output() {
        let (mut buf, mut t) = (vec![], false);
        push_capped(&mut buf, b"hello", 8, &mut t);
        assert!(!t);
        push_capped(&mut buf, b"world", 8, &mut t);
        assert_eq!(buf, b"hellowor");
        assert!(t);
    }
}
