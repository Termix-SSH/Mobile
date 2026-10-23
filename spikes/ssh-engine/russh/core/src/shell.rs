use std::sync::Arc;

use russh::client::Msg;
use russh::{ChannelMsg, ChannelWriteHalf};

use crate::{Session, ShellCallbacks, SshError};

#[derive(Debug, Clone, uniffi::Record)]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

#[derive(uniffi::Object)]
pub struct Shell {
    writer: ChannelWriteHalf<Msg>,
}

#[uniffi::export(async_runtime = "tokio")]
impl Session {
    /// Opens an interactive shell with a pty. Output goes to `callbacks` from a background task.
    pub async fn open_shell(
        &self,
        term: String,
        cols: u32,
        rows: u32,
        env: Vec<EnvVar>,
        callbacks: Arc<dyn ShellCallbacks>,
    ) -> Result<Arc<Shell>, SshError> {
        let channel = self.handle.channel_open_session().await?;
        for e in env {
            // Servers often refuse env vars, so no reply is asked for.
            channel.set_env(false, e.name, e.value).await?;
        }
        channel.request_pty(true, &term, cols, rows, 0, 0, &[]).await?;
        channel.request_shell(true).await?;
        let (mut reader, writer) = channel.split();
        tokio::spawn(async move {
            let mut code = None;
            while let Some(msg) = reader.wait().await {
                match msg {
                    ChannelMsg::Data { data } => callbacks.on_data(data.to_vec()),
                    ChannelMsg::ExtendedData { data, .. } => callbacks.on_data(data.to_vec()),
                    ChannelMsg::ExitStatus { exit_status } => code = Some(exit_status),
                    ChannelMsg::Close => break,
                    _ => {}
                }
            }
            callbacks.on_exit(code);
        });
        Ok(Arc::new(Shell { writer }))
    }
}

#[uniffi::export(async_runtime = "tokio")]
impl Shell {
    pub async fn write(&self, data: Vec<u8>) -> Result<(), SshError> {
        self.writer.data_bytes(data).await?;
        Ok(())
    }

    pub async fn resize(&self, cols: u32, rows: u32) -> Result<(), SshError> {
        self.writer.window_change(cols, rows, 0, 0).await?;
        Ok(())
    }

    pub async fn close(&self) -> Result<(), SshError> {
        self.writer.eof().await.ok();
        self.writer.close().await?;
        Ok(())
    }
}
