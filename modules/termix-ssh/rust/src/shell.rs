use std::sync::Arc;

use russh::client::Msg;
use russh::{ChannelMsg, ChannelReadHalf, ChannelWriteHalf, Pty, Sig};
use tokio::sync::watch;

use crate::{Session, ShellCallbacks, SshError};

#[derive(Debug, Clone, uniffi::Record)]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

#[derive(uniffi::Object)]
pub struct Shell {
    writer: ChannelWriteHalf<Msg>,
    paused: watch::Sender<bool>,
}

// What OpenSSH sends for a normal UTF-8 terminal. Without these some servers start with odd erase keys.
pub(crate) const MODES: &[(Pty, u32)] = &[
    (Pty::VINTR, 3),
    (Pty::VQUIT, 28),
    (Pty::VERASE, 127),
    (Pty::VKILL, 21),
    (Pty::VEOF, 4),
    (Pty::VSUSP, 26),
    (Pty::ICRNL, 1),
    (Pty::IXON, 1),
    (Pty::IUTF8, 1),
    (Pty::ISIG, 1),
    (Pty::ICANON, 1),
    (Pty::ECHO, 1),
    (Pty::ECHOE, 1),
    (Pty::ECHOK, 1),
    (Pty::IEXTEN, 1),
    (Pty::OPOST, 1),
    (Pty::ONLCR, 1),
    (Pty::TTY_OP_ISPEED, 38400),
    (Pty::TTY_OP_OSPEED, 38400),
];

pub(crate) fn sig_name(s: &Sig) -> String {
    match s {
        Sig::Custom(name) => name.clone(),
        other => format!("{other:?}"),
    }
}

pub(crate) fn parse_sig(name: &str) -> Sig {
    match name.trim_start_matches("SIG").to_ascii_uppercase().as_str() {
        "ABRT" => Sig::ABRT,
        "ALRM" => Sig::ALRM,
        "FPE" => Sig::FPE,
        "HUP" => Sig::HUP,
        "ILL" => Sig::ILL,
        "INT" => Sig::INT,
        "KILL" => Sig::KILL,
        "PIPE" => Sig::PIPE,
        "QUIT" => Sig::QUIT,
        "SEGV" => Sig::SEGV,
        "TERM" => Sig::TERM,
        "USR1" => Sig::USR1,
        other => Sig::Custom(other.to_string()),
    }
}

/// Waits while the reader is paused. False when the pause can never end.
pub(crate) async fn wait_unpaused(paused: &mut watch::Receiver<bool>) -> bool {
    paused.wait_for(|p| !*p).await.is_ok()
}

/// Reads a channel until it closes, then reports how it ended. While `paused` is set nothing is read,
/// so the channel window fills and the server stops sending.
pub(crate) async fn drain(
    mut reader: ChannelReadHalf,
    mut paused: Option<watch::Receiver<bool>>,
    mut on_out: impl FnMut(Vec<u8>),
    mut on_err: impl FnMut(Vec<u8>),
) -> (Option<u32>, Option<String>) {
    let (mut code, mut signal) = (None, None);
    loop {
        if let Some(p) = paused.as_mut() {
            if !wait_unpaused(p).await {
                paused = None;
            }
        }
        let Some(msg) = reader.wait().await else { break };
        match msg {
            ChannelMsg::Data { data } => on_out(data.to_vec()),
            ChannelMsg::ExtendedData { data, .. } => on_err(data.to_vec()),
            ChannelMsg::ExitStatus { exit_status } => code = Some(exit_status),
            ChannelMsg::ExitSignal { signal_name, .. } => signal = Some(sig_name(&signal_name)),
            ChannelMsg::Close => break,
            _ => {}
        }
    }
    (code, signal)
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
        channel.request_pty(true, &term, cols, rows, 0, 0, MODES).await?;
        channel.request_shell(true).await?;
        let (reader, writer) = channel.split();
        let (paused, rx) = watch::channel(false);
        tokio::spawn(async move {
            let cb = callbacks.clone();
            let (code, signal) =
                drain(reader, Some(rx), |d| callbacks.on_data(d), |d| cb.on_data(d)).await;
            cb.on_exit(code, signal);
        });
        Ok(Arc::new(Shell { writer, paused }))
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

    /// Like `INT` or `TERM`. Many servers ignore signals; Ctrl+C as input always works.
    pub async fn signal(&self, name: String) -> Result<(), SshError> {
        self.writer.signal(parse_sig(&name)).await?;
        Ok(())
    }

    /// Stops reading output until `resume`. The server stops once the channel window is full.
    pub fn pause(&self) {
        self.paused.send_replace(true);
    }

    pub fn resume(&self) {
        self.paused.send_replace(false);
    }

    pub async fn end(&self) -> Result<(), SshError> {
        self.resume();
        self.writer.eof().await.ok();
        self.writer.close().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn paused_reader_waits_for_resume() {
        let (tx, mut rx) = watch::channel(true);
        let waiter = tokio::spawn(async move { wait_unpaused(&mut rx).await });
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        assert!(!waiter.is_finished());
        tx.send_replace(false);
        assert!(waiter.await.unwrap());
    }

    #[tokio::test]
    async fn dropped_pause_never_blocks() {
        let (tx, mut rx) = watch::channel(true);
        drop(tx);
        assert!(!wait_unpaused(&mut rx).await);
    }

    #[test]
    fn signal_names_round_trip() {
        assert!(matches!(parse_sig("SIGINT"), Sig::INT));
        assert!(matches!(parse_sig("term"), Sig::TERM));
        assert_eq!(sig_name(&parse_sig("KILL")), "KILL");
        assert!(matches!(parse_sig("WINCH"), Sig::Custom(s) if s == "WINCH"));
    }
}
