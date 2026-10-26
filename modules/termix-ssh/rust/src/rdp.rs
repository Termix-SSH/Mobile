//! RDP on IronRDP, at the same revision as the remote desktop plugin's engine. TLS is rustls on
//! ring and NLA is NTLM; Kerberos and RD Gateway are not on the phone yet.

use std::sync::{Arc, Mutex};

use ironrdp::connector::connection_activation::ConnectionActivationState;
use ironrdp::connector::{self, ClientConnector, ConnectorErrorKind, ConnectorResult, Credentials, ServerName};
use ironrdp::displaycontrol::client::DisplayControlClient;
use ironrdp::dvc::DrdynvcClient;
use ironrdp::graphics::image_processing::PixelFormat;
use ironrdp::pdu::input::fast_path::{FastPathInputEvent, KeyboardFlags};
use ironrdp::pdu::input::mouse::PointerFlags;
use ironrdp::pdu::input::MousePdu;
use ironrdp::pdu::rdp::capability_sets::MajorPlatformType;
use ironrdp::pdu::rdp::client_info::{PerformanceFlags, TimezoneInfo};
use ironrdp::session::image::DecodedImage;
use ironrdp::session::{ActiveStage, ActiveStageBuilder, ActiveStageOutput};
use ironrdp_core::WriteBuf;
use ironrdp::connector::sspi::generator::NetworkRequest;
use ironrdp_tokio::{single_sequence_step_read, FramedWrite, MovableTokioFramed, NetworkClient};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::mpsc;

use crate::display::{Damage, DisplayCallbacks, DisplayConfig, Input};
use crate::remote::Conn;
use crate::SshError;

trait ReadWrite: AsyncRead + AsyncWrite + Send + Unpin {}
impl<T: AsyncRead + AsyncWrite + Send + Unpin> ReadWrite for T {}

type Framed = MovableTokioFramed<Box<dyn ReadWrite>>;

/// Kerberos needs the phone to reach a KDC; until that is wired up only NTLM is offered.
struct NoKdc;

impl NetworkClient for NoKdc {
    async fn send(&mut self, _: &NetworkRequest) -> ConnectorResult<Vec<u8>> {
        Err(connector::general_err!("Kerberos is not supported on the phone yet"))
    }
}

/// Which layers to offer, from the plugin's security setting. Legacy RDP security is TLS here too.
pub(crate) fn security(setting: &str) -> (bool, bool) {
    match setting {
        "nla" | "nla-ext" => (false, true),
        "tls" | "rdp" => (true, false),
        _ => (true, true),
    }
}

fn connector_config(config: &DisplayConfig) -> connector::Config {
    let (enable_tls, enable_credssp) = security(config.security.as_str());
    let username = config.username.clone().unwrap_or_default();
    let password = config.password.clone().unwrap_or_default();
    let autologon = !username.is_empty() || !password.is_empty();
    connector::Config {
        credentials: Credentials::UsernamePassword { username, password },
        domain: config.domain.clone().filter(|d| !d.is_empty()),
        enable_tls,
        enable_credssp,
        enable_standard_rdp_security: false,
        keyboard_type: ironrdp::pdu::gcc::KeyboardType::IBM_ENHANCED,
        keyboard_subtype: 0,
        keyboard_layout: 0x409,
        keyboard_functional_keys_count: 12,
        connection_type: ironrdp::pdu::gcc::ConnectionType::Lan,
        ime_file_name: String::new(),
        dig_product_id: String::new(),
        desktop_size: connector::DesktopSize {
            width: config.width.clamp(200, 8192) as u16,
            height: config.height.clamp(200, 8192) as u16,
        },
        monitor_layout: None,
        bitmap: Some(connector::BitmapConfig {
            color_depth: 32,
            lossy_compression: true,
            codecs: ironrdp::pdu::rdp::capability_sets::client_codecs_capabilities(&[]).unwrap_or_default(),
        }),
        client_build: 0,
        client_name: "Termix".to_owned(),
        client_dir: "C:\\Windows\\System32\\mstscax.dll".to_owned(),
        platform: MajorPlatformType::UNSPECIFIED,
        compression_type: None,
        enable_server_pointer: false,
        autologon,
        enable_audio_playback: false,
        enable_audio_capture: false,
        request_data: None,
        pointer_software_rendering: true,
        multitransport_flags: None,
        support_dyn_vc_gfx_protocol: false,
        performance_flags: PerformanceFlags::DISABLE_WALLPAPER
            | PerformanceFlags::DISABLE_FULLWINDOWDRAG
            | PerformanceFlags::DISABLE_MENUANIMATIONS
            | PerformanceFlags::ENABLE_FONT_SMOOTHING,
        desktop_scale_factor: if (100..=500).contains(&config.scale) { config.scale } else { 0 },
        hardware_id: None,
        license_cache: None,
        timezone_info: TimezoneInfo::default(),
        alternate_shell: String::new(),
        work_dir: String::new(),
        remote_application_mode: false,
        rail_support_level: ironrdp::pdu::rdp::capability_sets::RailSupportLevel::empty(),
    }
}

fn login_error(e: connector::ConnectorError) -> SshError {
    match e.kind() {
        ConnectorErrorKind::Credssp(_) | ConnectorErrorKind::AccessDenied => {
            SshError::Auth { msg: "The RDP server refused the login".into() }
        }
        _ => SshError::Connect { msg: format!("RDP: {e}") },
    }
}

async fn connect(conn: Conn, config: &DisplayConfig) -> Result<(connector::ConnectionResult, Framed), SshError> {
    let mut connector = ClientConnector::new(connector_config(config), std::net::SocketAddr::from(([127, 0, 0, 1], 0)));
    connector.attach_static_channel(DrdynvcClient::new().with_dynamic_channel(DisplayControlClient::new(|_| Ok(Vec::new()))));

    let mut framed = MovableTokioFramed::new(conn);
    let should_upgrade = ironrdp_tokio::connect_begin(&mut framed, &mut connector).await.map_err(login_error)?;
    let (stream, leftover) = framed.into_inner();
    // A certificate the phone can't verify (most RDP servers sign their own)
    // is taken only when it is the one the user trusted, like an SSH host key.
    let refused: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let expected = config.server_cert.clone();
    let seen = refused.clone();
    let callback: ironrdp_tls::CertificateValidationCallback = Arc::new(move |der: &[u8], _: &str, _: &str| {
        let fingerprint = cert_fingerprint(der);
        if expected.as_deref() == Some(fingerprint.as_str()) {
            return true;
        }
        *seen.lock().unwrap_or_else(|e| e.into_inner()) = Some(fingerprint);
        false
    });
    let upgraded = ironrdp_tls::upgrade_with_certificate_validation_callback(stream, &config.dial.host, callback).await;
    let (tls, cert) = match upgraded {
        Ok(done) => done,
        Err(e) => {
            if let Some(fingerprint) = refused.lock().unwrap_or_else(|e| e.into_inner()).take() {
                return Err(cert_error(config.server_cert.is_some(), &fingerprint));
            }
            return Err(SshError::Connect { msg: format!("RDP TLS: {e}") });
        }
    };
    let upgraded = ironrdp_tokio::mark_as_upgraded(should_upgrade, &mut connector);
    let key = ironrdp_tls::extract_tls_server_public_key(&cert)
        .ok_or_else(|| SshError::Connect { msg: "RDP: no public key in the server certificate".into() })?
        .to_owned();
    let boxed: Box<dyn ReadWrite> = Box::new(tls);
    let mut framed = MovableTokioFramed::new_with_leftover(boxed, leftover);
    let result = ironrdp_tokio::connect_finalize(
        upgraded,
        connector,
        &mut framed,
        &mut NoKdc,
        ServerName::new(config.dial.host.clone()),
        key,
        None,
    )
    .await
    .map_err(login_error)?;
    Ok((result, framed))
}

pub(crate) async fn start(
    conn: Conn,
    config: &DisplayConfig,
    input: mpsc::UnboundedReceiver<Input>,
    cb: Arc<dyn DisplayCallbacks>,
) -> Result<(), SshError> {
    // IronRDP's futures aren't all Send, so the connection gets its own thread and runtime.
    // Sockets stay registered with the engine's runtime, which keeps running.
    let rt = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let (done, ready) = tokio::sync::oneshot::channel();
    let config = config.clone();
    std::thread::Builder::new().name("termix-rdp".into()).spawn(move || {
        rt.block_on(async move {
            match connect(conn, &config).await {
                Ok((result, framed)) => {
                    let session = Active::new(result, framed);
                    cb.on_resize(session.image.width() as u32, session.image.height() as u32);
                    if done.send(Ok(())).is_ok() {
                        session.run(input, cb).await;
                    }
                }
                Err(e) => {
                    done.send(Err(e)).ok();
                }
            }
        })
    })?;
    ready.await.map_err(|_| SshError::Connect { msg: "RDP stopped while connecting".into() })?
}

struct Active {
    framed: Framed,
    stage: ActiveStage,
    image: DecodedImage,
    factory: connector::connection_activation::ConnectionActivationFactory,
    buttons: u8,
    last: (u16, u16),
}

impl Active {
    fn new(result: connector::ConnectionResult, framed: Framed) -> Self {
        let image = DecodedImage::new(PixelFormat::RgbA32, result.desktop_size.width, result.desktop_size.height);
        let stage = ActiveStageBuilder {
            static_channels: result.static_channels,
            user_channel_id: result.user_channel_id,
            io_channel_id: result.io_channel_id,
            message_channel_id: result.message_channel_id,
            share_id: result.share_id,
            compression_type: result.compression_type,
            enable_server_pointer: result.enable_server_pointer,
            pointer_software_rendering: result.pointer_software_rendering,
        }
        .build();
        Self { framed, stage, image, factory: result.activation_factory, buttons: 0, last: (0, 0) }
    }
}

enum Flow {
    Go,
    Stop(Option<String>),
}

impl Active {
    async fn run(mut self, mut input: mpsc::UnboundedReceiver<Input>, cb: Arc<dyn DisplayCallbacks>) {
        let reason = loop {
            let flow = tokio::select! {
                pdu = self.framed.read_pdu() => match pdu {
                    Ok((action, payload)) => self.on_pdu(action, payload.to_vec(), &cb).await,
                    Err(_) => Flow::Stop(Some("The RDP server closed the connection".into())),
                },
                msg = input.recv() => match msg {
                    None | Some(Input::Close) => {
                        self.close().await;
                        Flow::Stop(None)
                    }
                    Some(msg) => self.on_input(msg, &cb).await,
                },
            };
            if let Flow::Stop(reason) = flow {
                break reason;
            }
        };
        cb.on_closed(reason);
    }

    // Owned buffers here: borrowed slices across these awaits trip the compiler's Send check.
    async fn send(&mut self, frame: Vec<u8>) -> bool {
        frame.is_empty() || self.framed.write_all(&frame).await.is_ok()
    }

    async fn on_pdu(&mut self, action: ironrdp::pdu::Action, payload: Vec<u8>, cb: &Arc<dyn DisplayCallbacks>) -> Flow {
        let outputs = match self.stage.process(&mut self.image, action, &payload) {
            Ok(out) => out,
            Err(e) => return Flow::Stop(Some(format!("RDP: {e}"))),
        };
        let mut damage = Damage::default();
        for out in outputs {
            match out {
                ActiveStageOutput::ResponseFrame(frame) => {
                    if !self.send(frame).await {
                        return Flow::Stop(Some("The RDP connection broke".into()));
                    }
                }
                ActiveStageOutput::GraphicsUpdate(r) => {
                    let w = (r.right.saturating_sub(r.left) + 1) as u32;
                    let h = (r.bottom.saturating_sub(r.top) + 1) as u32;
                    damage.add(r.left as u32, r.top as u32, w, h);
                }
                ActiveStageOutput::DeactivateAll => {
                    if let Err(e) = self.reactivate(cb).await {
                        return Flow::Stop(Some(e));
                    }
                    damage = Damage::default();
                }
                ActiveStageOutput::Terminate(reason) => return Flow::Stop(Some(reason.description().to_string())),
                _ => {}
            }
        }
        let (w, h) = (self.image.width() as u32, self.image.height() as u32);
        damage.flush(&**cb, self.image.data(), w, h);
        Flow::Go
    }

    /// The server's Deactivate All, sent after a resize: run the activation again on the same socket.
    async fn reactivate(&mut self, cb: &Arc<dyn DisplayCallbacks>) -> Result<(), String> {
        let mut activation = self.factory.create();
        let mut buf = WriteBuf::new();
        loop {
            let written = single_sequence_step_read(&mut self.framed, &mut activation, &mut buf)
                .await
                .map_err(|e| format!("RDP: {e}"))?;
            if written.size().is_some() && !self.send(buf.filled().to_vec()).await {
                return Err("The RDP connection broke".into());
            }
            if let ConnectionActivationState::Finalized {
                desktop_size,
                share_id,
                enable_server_pointer,
                pointer_software_rendering,
                static_channel_chunk_size,
                window_support_level,
                ..
            } = activation.connection_activation_state()
            {
                self.image = DecodedImage::new(PixelFormat::RgbA32, desktop_size.width, desktop_size.height);
                if !self.stage.reactivate(
                    activation.io_channel_id(),
                    activation.user_channel_id(),
                    share_id,
                    enable_server_pointer,
                    pointer_software_rendering,
                    static_channel_chunk_size,
                ) {
                    return Err("RDP: invalid static channel chunk size".into());
                }
                self.stage.set_window_support_level(window_support_level);
                cb.on_resize(desktop_size.width as u32, desktop_size.height as u32);
                return Ok(());
            }
        }
    }

    async fn on_input(&mut self, input: Input, cb: &Arc<dyn DisplayCallbacks>) -> Flow {
        let events = match input {
            Input::Pointer { x, y, buttons } => self.pointer(x, y, buttons),
            Input::KeySym { sym, down } => key_events(sym, down),
            Input::Unicode { ch, down } => unicode_events(ch, down),
            Input::Resize { width, height, scale } => {
                let (w, h) = ironrdp::displaycontrol::pdu::MonitorLayoutEntry::adjust_display_size(width, height);
                let scale = (100..=500).contains(&scale).then_some(scale);
                if let Some(Ok(frame)) = self.stage.encode_resize(w, h, scale, None)
                    && !self.send(frame).await
                {
                    return Flow::Stop(Some("The RDP connection broke".into()));
                }
                return Flow::Go;
            }
            Input::Refresh => {
                let (w, h) = (self.image.width() as u32, self.image.height() as u32);
                let mut all = Damage::default();
                all.add(0, 0, w, h);
                all.flush(&**cb, self.image.data(), w, h);
                return Flow::Go;
            }
            // The clipboard channel is a follow up after the prototype.
            Input::Clipboard(_) | Input::Close => return Flow::Go,
        };
        if events.is_empty() {
            return Flow::Go;
        }
        let Ok(outputs) = self.stage.process_fastpath_input(&mut self.image, &events) else {
            return Flow::Go;
        };
        for out in outputs {
            if let ActiveStageOutput::ResponseFrame(frame) = out
                && !self.send(frame).await
            {
                return Flow::Stop(Some("The RDP connection broke".into()));
            }
        }
        Flow::Go
    }

    fn pointer(&mut self, x: u32, y: u32, buttons: u8) -> Vec<FastPathInputEvent> {
        let (x, y) = (x.min(u16::MAX as u32) as u16, y.min(u16::MAX as u32) as u16);
        let events = mouse_events(self.last, self.buttons, x, y, buttons);
        self.last = (x, y);
        self.buttons = buttons;
        events
    }

    async fn close(&mut self) {
        if let Ok(outputs) = self.stage.graceful_shutdown() {
            for out in outputs {
                if let ActiveStageOutput::ResponseFrame(frame) = out {
                    self.send(frame).await;
                }
            }
        }
    }
}

/// Guacamole style buttons to RDP mouse events, like the plugin's engine.
pub(crate) fn mouse_events(last: (u16, u16), before: u8, x: u16, y: u16, buttons: u8) -> Vec<FastPathInputEvent> {
    let pdu = |flags: PointerFlags, wheel: i16| {
        FastPathInputEvent::MouseEvent(MousePdu { flags, number_of_wheel_rotation_units: wheel, x_position: x, y_position: y })
    };
    let mut out = Vec::new();
    if (x, y) != last || buttons == before {
        out.push(pdu(PointerFlags::MOVE, 0));
    }
    let changed = buttons ^ before;
    for (bit, flag) in
        [(1u8, PointerFlags::LEFT_BUTTON), (2, PointerFlags::MIDDLE_BUTTON_OR_WHEEL), (4, PointerFlags::RIGHT_BUTTON)]
    {
        if changed & bit != 0 {
            let down = if buttons & bit != 0 { PointerFlags::DOWN } else { PointerFlags::empty() };
            out.push(pdu(flag | down, 0));
        }
    }
    if changed & 8 != 0 && buttons & 8 != 0 {
        out.push(pdu(PointerFlags::VERTICAL_WHEEL, 120));
    }
    if changed & 16 != 0 && buttons & 16 != 0 {
        out.push(pdu(PointerFlags::VERTICAL_WHEEL | PointerFlags::WHEEL_NEGATIVE, -120));
    }
    out
}

/// Scancodes for keys that have no character, plus US letters and digits so Ctrl combos work.
/// Bit 8 marks an extended (0xE0) key.
pub(crate) fn scancode(sym: u32) -> Option<u16> {
    Some(match sym {
        0xff08 => 0x0e,
        0xff09 => 0x0f,
        0xff0d => 0x1c,
        0xff1b => 0x01,
        0xffff => 0x153,
        0xff63 => 0x152,
        0xff50 => 0x147,
        0xff57 => 0x14f,
        0xff55 => 0x149,
        0xff56 => 0x151,
        0xff51 => 0x14b,
        0xff52 => 0x148,
        0xff53 => 0x14d,
        0xff54 => 0x150,
        0xffe1 => 0x2a,
        0xffe2 => 0x36,
        0xffe3 => 0x1d,
        0xffe4 => 0x11d,
        0xffe9 => 0x38,
        0xffea => 0x138,
        0xffeb => 0x15b,
        0xffec => 0x15c,
        0xff67 => 0x15d,
        0xff13 => 0x45,
        0xff14 => 0x46,
        0xffe5 => 0x3a,
        0xff7f => 0x145,
        0x20 => 0x39,
        0xffbe..=0xffc7 => 0x3b + (sym - 0xffbe) as u16,
        0xffc8 => 0x57,
        0xffc9 => 0x58,
        _ => return us_key(sym),
    })
}

fn us_key(sym: u32) -> Option<u16> {
    const ROWS: [(&str, u16); 4] = [("1234567890", 0x02), ("qwertyuiop", 0x10), ("asdfghjkl", 0x1e), ("zxcvbnm", 0x2c)];
    let ch = char::from_u32(sym)?.to_ascii_lowercase();
    ROWS.iter().find_map(|(row, base)| row.find(ch).map(|i| base + i as u16))
}

fn key_events(sym: u32, down: bool) -> Vec<FastPathInputEvent> {
    // Upper case letters go as unicode so Shift isn't needed.
    let is_upper = char::from_u32(sym).is_some_and(|c| c.is_ascii_uppercase());
    match scancode(sym).filter(|_| !is_upper) {
        Some(code) => {
            let mut flags = if down { KeyboardFlags::empty() } else { KeyboardFlags::RELEASE };
            if code & 0x100 != 0 {
                flags |= KeyboardFlags::EXTENDED;
            }
            vec![FastPathInputEvent::KeyboardEvent(flags, (code & 0xff) as u8)]
        }
        None => {
            let ch = if (0x0100_0000..=0x0110_ffff).contains(&sym) { sym - 0x0100_0000 } else { sym };
            unicode_events(ch, down)
        }
    }
}

fn unicode_events(ch: u32, down: bool) -> Vec<FastPathInputEvent> {
    let Some(c) = char::from_u32(ch) else { return Vec::new() };
    let flags = if down { KeyboardFlags::empty() } else { KeyboardFlags::RELEASE };
    let mut units = [0u16; 2];
    c.encode_utf16(&mut units).iter().map(|&u| FastPathInputEvent::UnicodeKeyboardEvent(flags, u)).collect()
}

/// SHA-256 of the certificate, as openssl prints it: AB:CD:...
fn cert_fingerprint(der: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(der).iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(":")
}

/// The app reads these: RDP_CERT_NEW asks to trust, RDP_CERT_CHANGED warns.
fn cert_error(had_one: bool, fingerprint: &str) -> SshError {
    let kind = if had_one { "RDP_CERT_CHANGED" } else { "RDP_CERT_NEW" };
    SshError::Connect { msg: format!("{kind} {fingerprint}") }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::display::DisplayProtocol;
    use crate::remote::DialConfig;

    fn config(security: &str) -> DisplayConfig {
        DisplayConfig {
            dial: DialConfig { host: "pc".into(), port: 3389, proxies: vec![], connect_timeout_secs: 5 },
            protocol: DisplayProtocol::Rdp,
            username: Some("me".into()),
            password: Some("pw".into()),
            domain: Some(String::new()),
            width: 100,
            height: 9000,
            scale: 200,
            security: security.into(),
            server_cert: None,
        }
    }

    #[test]
    fn fingerprints_like_openssl_and_names_the_case() {
        // sha256("abc")
        assert_eq!(
            cert_fingerprint(b"abc"),
            "BA:78:16:BF:8F:01:CF:EA:41:41:40:DE:5D:AE:22:23:B0:03:61:A3:96:17:7A:9C:B4:10:FF:61:F2:00:15:AD"
        );
        let new = cert_error(false, "AA:BB").to_string();
        assert!(new.contains("RDP_CERT_NEW AA:BB"), "{new}");
        assert!(cert_error(true, "AA:BB").to_string().contains("RDP_CERT_CHANGED AA:BB"));
    }

    #[test]
    fn builds_the_connector_config() {
        let c = connector_config(&config(""));
        assert!(c.enable_tls && c.enable_credssp && c.autologon);
        assert_eq!((c.desktop_size.width, c.desktop_size.height), (200, 8192));
        assert_eq!(c.desktop_scale_factor, 200);
        assert_eq!(c.domain, None);
        assert_eq!(security("nla"), (false, true));
        assert_eq!(security("rdp"), (true, false));
        assert_eq!(connector_config(&DisplayConfig { scale: 50, ..config("") }).desktop_scale_factor, 0);
    }

    #[test]
    fn keys_map_to_scancodes_or_unicode() {
        assert_eq!(scancode(0xff0d), Some(0x1c));
        assert_eq!(scancode(0xff51), Some(0x14b));
        assert_eq!(scancode('c' as u32), Some(0x2e));
        assert_eq!(scancode('1' as u32), Some(0x02));
        assert_eq!(scancode(0xffc1), Some(0x3e));
        assert_eq!(scancode(0xffc7), Some(0x44));
        assert_eq!(scancode('é' as u32), None);
        assert!(matches!(key_events('A' as u32, true)[0], FastPathInputEvent::UnicodeKeyboardEvent(_, 0x41)));
        assert!(matches!(
            key_events(0xff52, false)[0],
            FastPathInputEvent::KeyboardEvent(f, 0x48) if f.contains(KeyboardFlags::RELEASE | KeyboardFlags::EXTENDED)
        ));
        assert_eq!(unicode_events('😀' as u32, true).len(), 2);
    }

    #[test]
    fn mouse_sends_moves_buttons_and_wheel() {
        let down = mouse_events((0, 0), 0, 5, 5, 1);
        assert_eq!(down.len(), 2);
        let wheel = mouse_events((5, 5), 1, 5, 5, 1 | 8);
        assert_eq!(wheel.len(), 1);
        let up = mouse_events((5, 5), 9, 5, 5, 0);
        assert_eq!(up.len(), 1);
    }

    #[tokio::test]
    async fn a_closed_port_fails_cleanly() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            drop(tcp);
        });
        let conn = crate::remote::open(
            &DialConfig { host: "127.0.0.1".into(), port, proxies: vec![], connect_timeout_secs: 5 },
            None,
        )
        .await
        .unwrap();
        assert!(matches!(connect(conn, &config("")).await, Err(SshError::Connect { .. })));
    }
}

