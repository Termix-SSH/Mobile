//! Remote displays (VNC, RDP). Each protocol runs its own task; the app sends input through
//! `RemoteDisplay` and gets pixels back through `DisplayCallbacks`, never through JS.
#![cfg_attr(not(any(feature = "vnc", feature = "rdp")), allow(dead_code, unused, unreachable_code))]

use std::sync::Arc;

use tokio::sync::mpsc;

use crate::remote::{self, DialConfig};
use crate::{Session, SshError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum DisplayProtocol {
    Vnc,
    Rdp,
}

#[derive(Clone, uniffi::Record)]
pub struct DisplayConfig {
    pub dial: DialConfig,
    pub protocol: DisplayProtocol,
    pub username: Option<String>,
    pub password: Option<String>,
    /// RDP only.
    pub domain: Option<String>,
    /// The size to ask for. VNC servers pick their own.
    pub width: u32,
    pub height: u32,
    /// RDP desktop scale in percent, 100 to 500. 0 leaves it to the server.
    pub scale: u32,
    /// RDP security like the plugin's setting: any, nla, tls. Empty means any.
    pub security: String,
    /// RDP only: the certificate fingerprint the user trusted for this host.
    /// Any other certificate stops the login before the password is sent.
    pub server_cert: Option<String>,
}

impl std::fmt::Debug for DisplayConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DisplayConfig")
            .field("dial", &self.dial)
            .field("protocol", &self.protocol)
            .field("username", &self.username)
            .field("password", &self.password.as_ref().map(|_| "***"))
            .field("width", &self.width)
            .field("height", &self.height)
            .finish_non_exhaustive()
    }
}

#[uniffi::export(with_foreign)]
pub trait DisplayCallbacks: Send + Sync {
    /// The framebuffer is now this size. Every pixel comes again in frames.
    fn on_resize(&self, width: u32, height: u32);
    /// RGBA pixels for one changed rectangle, `width * height * 4` bytes.
    fn on_frame(&self, x: u32, y: u32, width: u32, height: u32, rgba: Vec<u8>);
    fn on_clipboard(&self, text: String);
    /// The session ended. `reason` is None when this side closed it.
    fn on_closed(&self, reason: Option<String>);
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Input {
    /// Buttons like Guacamole: 1 left, 2 middle, 4 right, 8 wheel up, 16 wheel down.
    Pointer { x: u32, y: u32, buttons: u8 },
    KeySym { sym: u32, down: bool },
    Unicode { ch: u32, down: bool },
    Clipboard(String),
    Resize { width: u32, height: u32, scale: u32 },
    Refresh,
    Close,
}

#[derive(uniffi::Object)]
pub struct RemoteDisplay {
    tx: mpsc::UnboundedSender<Input>,
}

impl RemoteDisplay {
    fn send(&self, input: Input) {
        self.tx.send(input).ok();
    }
}

#[uniffi::export]
impl RemoteDisplay {
    pub fn pointer(&self, x: u32, y: u32, buttons: u8) {
        self.send(Input::Pointer { x, y, buttons });
    }

    /// An X11 keysym, as Guacamole and VNC use.
    pub fn key_sym(&self, sym: u32, down: bool) {
        self.send(Input::KeySym { sym, down });
    }

    /// A typed character, for text from the on-screen keyboard.
    pub fn unicode(&self, ch: u32, down: bool) {
        self.send(Input::Unicode { ch, down });
    }

    pub fn clipboard_set(&self, text: String) {
        self.send(Input::Clipboard(text));
    }

    pub fn resize(&self, width: u32, height: u32, scale: u32) {
        self.send(Input::Resize { width, height, scale });
    }

    /// Asks for every pixel again, after the view was recreated.
    pub fn refresh(&self) {
        self.send(Input::Refresh);
    }

    /// Ends the session. Not `close`, which Kotlin bindings already use for AutoCloseable.
    pub fn stop(&self) {
        self.send(Input::Close);
    }
}

impl Drop for RemoteDisplay {
    fn drop(&mut self) {
        self.tx.send(Input::Close).ok();
    }
}

/// The protocols this build was compiled with.
#[uniffi::export]
pub fn display_protocols() -> Vec<DisplayProtocol> {
    [
        #[cfg(feature = "vnc")]
        DisplayProtocol::Vnc,
        #[cfg(feature = "rdp")]
        DisplayProtocol::Rdp,
    ]
    .to_vec()
}

/// Connects and logs in. Login errors come back here; later errors go to `on_closed`.
#[uniffi::export(async_runtime = "tokio")]
pub async fn open_display(
    config: DisplayConfig,
    via: Option<Arc<Session>>,
    callbacks: Arc<dyn DisplayCallbacks>,
) -> Result<Arc<RemoteDisplay>, SshError> {
    let conn = remote::open(&config.dial, via).await?;
    let (tx, rx) = mpsc::unbounded_channel();
    match config.protocol {
        #[cfg(feature = "vnc")]
        DisplayProtocol::Vnc => crate::vnc::start(conn, &config, rx, callbacks).await?,
        #[cfg(feature = "rdp")]
        DisplayProtocol::Rdp => crate::rdp::start(conn, &config, rx, callbacks).await?,
        #[allow(unreachable_patterns)]
        other => {
            let _ = (conn, rx, callbacks);
            return Err(SshError::Connect { msg: format!("{other:?} is not in this build") });
        }
    }
    Ok(Arc::new(RemoteDisplay { tx }))
}

/// One changed area, merged from the rectangles of an update.
#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub(crate) struct Damage {
    pub x1: u32,
    pub y1: u32,
    pub x2: u32,
    pub y2: u32,
}

impl Damage {
    pub(crate) fn add(&mut self, x: u32, y: u32, w: u32, h: u32) {
        if w == 0 || h == 0 {
            return;
        }
        if self.is_empty() {
            *self = Damage { x1: x, y1: y, x2: x + w, y2: y + h };
            return;
        }
        self.x1 = self.x1.min(x);
        self.y1 = self.y1.min(y);
        self.x2 = self.x2.max(x + w);
        self.y2 = self.y2.max(y + h);
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.x2 <= self.x1 || self.y2 <= self.y1
    }

    /// Sends the area's pixels from an RGBA buffer `width` pixels wide, then clears it.
    pub(crate) fn flush(&mut self, cb: &dyn DisplayCallbacks, rgba: &[u8], width: u32, height: u32) {
        let x2 = self.x2.min(width);
        let y2 = self.y2.min(height);
        if self.x1 < x2 && self.y1 < y2 {
            let (w, h) = (x2 - self.x1, y2 - self.y1);
            cb.on_frame(self.x1, self.y1, w, h, crop(rgba, width, self.x1, self.y1, w, h));
        }
        *self = Damage::default();
    }
}

pub(crate) fn crop(rgba: &[u8], width: u32, x: u32, y: u32, w: u32, h: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity((w * h * 4) as usize);
    for row in y..y + h {
        let start = ((row * width + x) * 4) as usize;
        out.extend_from_slice(&rgba[start..start + (w * 4) as usize]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn damage_merges_and_crops() {
        let mut d = Damage::default();
        assert!(d.is_empty());
        d.add(2, 1, 1, 1);
        d.add(0, 0, 1, 1);
        d.add(5, 5, 0, 9);
        assert_eq!(d, Damage { x1: 0, y1: 0, x2: 3, y2: 2 });
        let px: Vec<u8> = (0..4 * 3 * 2).map(|i| i as u8).collect();
        assert_eq!(crop(&px, 3, 1, 1, 2, 1), (16..24).collect::<Vec<u8>>());
    }
}
