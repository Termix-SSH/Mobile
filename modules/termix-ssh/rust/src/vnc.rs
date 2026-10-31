//! VNC (RFB 3.3 to 3.8) client, ported from the remote desktop plugin's engine. Pixels are asked
//! for as 32 bit RGBX so they land in the RGBA framebuffer as they are.

use std::sync::Arc;

use flate2::{Decompress, FlushDecompress, Status};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader, ReadHalf, WriteHalf};
use tokio::sync::{mpsc, Mutex};

use crate::display::{Damage, DisplayCallbacks, DisplayConfig, Input};
use crate::remote::Conn;
use crate::SshError;

const SEC_NONE: u8 = 1;
const SEC_VNC: u8 = 2;
const SEC_ARD: u8 = 30;

const ENC_RAW: i32 = 0;
const ENC_COPYRECT: i32 = 1;
const ENC_HEXTILE: i32 = 5;
const ENC_ZRLE: i32 = 16;
const ENC_DESKTOP_SIZE: i32 = -223;
const ENC_LAST_RECT: i32 = -224;
const ENC_EXTENDED_DESKTOP_SIZE: i32 = -308;

const ENCODINGS: &[i32] = &[
    ENC_ZRLE,
    ENC_HEXTILE,
    ENC_COPYRECT,
    ENC_RAW,
    ENC_DESKTOP_SIZE,
    ENC_EXTENDED_DESKTOP_SIZE,
    ENC_LAST_RECT,
];

fn proto(msg: impl Into<String>) -> SshError {
    SshError::Connect { msg: msg.into() }
}

/// The version to answer with. macOS 3.889 is answered as 3.8, like guacd.
pub(crate) fn choose_version(banner: &[u8]) -> Result<(u8, &'static [u8; 12]), SshError> {
    let text = std::str::from_utf8(banner).map_err(|_| proto("Not a VNC server"))?;
    let rest = text.strip_prefix("RFB ").and_then(|r| r.strip_suffix('\n')).ok_or_else(|| proto("Not a VNC server"))?;
    let (major, minor) = rest.split_once('.').ok_or_else(|| proto("Not a VNC server"))?;
    let (major, minor): (u32, u32) =
        (major.parse().map_err(|_| proto("Not a VNC server"))?, minor.parse().map_err(|_| proto("Not a VNC server"))?);
    Ok(if major > 3 || minor >= 8 {
        (8, b"RFB 003.008\n")
    } else if minor == 7 {
        (7, b"RFB 003.007\n")
    } else {
        (3, b"RFB 003.003\n")
    })
}

/// The login to use from what the server offers.
pub(crate) fn choose_security(offered: &[u8], username: &str, password: &str) -> Option<u8> {
    let order: &[u8] = if username.is_empty() { &[SEC_VNC, SEC_NONE] } else { &[SEC_ARD, SEC_VNC, SEC_NONE] };
    order.iter().copied().find(|t| {
        offered.contains(t) && !(*t == SEC_VNC && password.is_empty() && offered.contains(&SEC_NONE))
    })
}

fn mirror(b: u8) -> u8 {
    b.reverse_bits()
}

/// VncAuth: the challenge DES encrypted with the password, each key byte bit mirrored.
pub(crate) fn vnc_auth_response(password: &str, challenge: &[u8; 16]) -> [u8; 16] {
    use des::cipher::{BlockEncrypt, KeyInit};
    let mut key = [0u8; 8];
    for (i, c) in password.chars().take(8).enumerate() {
        key[i] = mirror(if (c as u32) < 256 { c as u8 } else { b'?' });
    }
    let cipher = des::Des::new_from_slice(&key).expect("8 byte key");
    let mut out = *challenge;
    for block in out.chunks_mut(8) {
        cipher.encrypt_block(block.into());
    }
    out
}

/// Apple Remote Desktop login: Diffie-Hellman, then the login AES encrypted with MD5 of the secret.
pub(crate) fn ard_response(
    generator: &[u8],
    prime: &[u8],
    server_key: &[u8],
    username: &str,
    password: &str,
    private: &[u8],
) -> Vec<u8> {
    use aes::cipher::{BlockEncrypt, KeyInit};
    use md5::Digest;
    use num_bigint::BigUint;
    let p = BigUint::from_bytes_be(prime);
    let g = BigUint::from_bytes_be(generator);
    let x = BigUint::from_bytes_be(private) % &p;
    let public = pad(g.modpow(&x, &p).to_bytes_be(), prime.len());
    let secret = pad(BigUint::from_bytes_be(server_key).modpow(&x, &p).to_bytes_be(), prime.len());
    let key = md5::Md5::digest(&secret);
    let mut creds = [0u8; 128];
    rand::fill(&mut creds[..]);
    c_string(&mut creds[..64], username);
    c_string(&mut creds[64..], password);
    let cipher = aes::Aes128::new_from_slice(&key).expect("16 byte key");
    for block in creds.chunks_mut(16) {
        cipher.encrypt_block(block.into());
    }
    let mut out = creds.to_vec();
    out.extend(public);
    out
}

fn c_string(target: &mut [u8], value: &str) {
    let bytes = value.as_bytes();
    let n = bytes.len().min(target.len() - 1);
    target[..n].copy_from_slice(&bytes[..n]);
    target[n] = 0;
}

fn pad(mut value: Vec<u8>, len: usize) -> Vec<u8> {
    if value.len() < len {
        let mut out = vec![0u8; len - value.len()];
        out.append(&mut value);
        return out;
    }
    value
}

async fn reason<R: AsyncRead + Unpin>(r: &mut R) -> Result<String, SshError> {
    let len = r.read_u32().await? as usize;
    let mut buf = vec![0u8; len.min(4096)];
    r.read_exact(&mut buf).await?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

async fn auth_result<R: AsyncRead + Unpin>(r: &mut R, minor: u8) -> Result<(), SshError> {
    if r.read_u32().await? == 0 {
        return Ok(());
    }
    let msg = if minor == 8 { reason(r).await.unwrap_or_default() } else { String::new() };
    Err(SshError::Auth { msg: if msg.is_empty() { "The VNC server refused the login".into() } else { msg } })
}

/// The RGBA framebuffer the decoders draw into.
pub(crate) struct Framebuffer {
    pub width: u32,
    pub height: u32,
    pub px: Vec<u8>,
}

impl Framebuffer {
    pub(crate) fn new(width: u32, height: u32) -> Self {
        Self { width, height, px: vec![0; (width * height * 4) as usize] }
    }

    fn put(&mut self, x: u32, y: u32, rgb: [u8; 3]) {
        if x < self.width && y < self.height {
            let o = ((y * self.width + x) * 4) as usize;
            self.px[o..o + 4].copy_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
        }
    }

    fn fill(&mut self, x: u32, y: u32, w: u32, h: u32, rgb: [u8; 3]) {
        for row in y..(y + h).min(self.height) {
            for col in x..(x + w).min(self.width) {
                self.put(col, row, rgb);
            }
        }
    }

    fn copy(&mut self, sx: u32, sy: u32, w: u32, h: u32, dx: u32, dy: u32) {
        let (fw, fh) = (self.width, self.height);
        if sx + w > fw || sy + h > fh || dx + w > fw || dy + h > fh {
            return;
        }
        let rows: Box<dyn Iterator<Item = u32>> = if dy > sy { Box::new((0..h).rev()) } else { Box::new(0..h) };
        for row in rows {
            let s = (((sy + row) * fw + sx) * 4) as usize;
            let d = (((dy + row) * fw + dx) * 4) as usize;
            self.px.copy_within(s..s + (w * 4) as usize, d);
        }
    }
}

fn rgbx(p: &[u8]) -> [u8; 3] {
    [p[0], p[1], p[2]]
}

pub(crate) async fn decode_raw<R: AsyncRead + Unpin>(
    r: &mut R,
    fb: &mut Framebuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<(), SshError> {
    let mut row = vec![0u8; (w * 4) as usize];
    for dy in 0..h {
        r.read_exact(&mut row).await?;
        for dx in 0..w {
            let o = (dx * 4) as usize;
            fb.put(x + dx, y + dy, rgbx(&row[o..o + 4]));
        }
    }
    Ok(())
}

pub(crate) async fn decode_hextile<R: AsyncRead + Unpin>(
    r: &mut R,
    fb: &mut Framebuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<(), SshError> {
    let (mut bg, mut fg) = ([0u8; 3], [0u8; 3]);
    let mut px = [0u8; 4];
    for ty in (y..y + h).step_by(16) {
        for tx in (x..x + w).step_by(16) {
            let tw = 16.min(x + w - tx);
            let th = 16.min(y + h - ty);
            let flags = r.read_u8().await?;
            if flags & 1 != 0 {
                decode_raw(r, fb, tx, ty, tw, th).await?;
                continue;
            }
            if flags & 2 != 0 {
                r.read_exact(&mut px).await?;
                bg = rgbx(&px);
            }
            fb.fill(tx, ty, tw, th, bg);
            if flags & 4 != 0 {
                r.read_exact(&mut px).await?;
                fg = rgbx(&px);
            }
            if flags & 8 == 0 {
                continue;
            }
            let count = r.read_u8().await?;
            let coloured = flags & 16 != 0;
            for _ in 0..count {
                let color = if coloured {
                    r.read_exact(&mut px).await?;
                    rgbx(&px)
                } else {
                    fg
                };
                let xy = r.read_u8().await? as u32;
                let wh = r.read_u8().await? as u32;
                fb.fill(tx + (xy >> 4), ty + (xy & 15), (wh >> 4) + 1, (wh & 15) + 1, color);
            }
        }
    }
    Ok(())
}

/// ZRLE keeps one zlib stream for the whole connection.
pub(crate) struct Zrle {
    z: Decompress,
}

impl Zrle {
    pub(crate) fn new() -> Self {
        Self { z: Decompress::new(true) }
    }

    fn inflate(&mut self, input: &[u8]) -> Result<Vec<u8>, SshError> {
        let mut out = Vec::with_capacity(input.len() * 4 + 1024);
        let mut used = 0;
        loop {
            if out.capacity() - out.len() < 1024 {
                out.reserve(out.capacity());
            }
            let before = self.z.total_in();
            let status = self
                .z
                .decompress_vec(&input[used..], &mut out, FlushDecompress::Sync)
                .map_err(|e| proto(format!("ZRLE: {e}")))?;
            used += (self.z.total_in() - before) as usize;
            if used >= input.len() && out.len() < out.capacity() {
                return Ok(out);
            }
            if status == Status::StreamEnd {
                return Ok(out);
            }
        }
    }
}

struct Bytes<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Bytes<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], SshError> {
        let end = self.pos + n;
        let out = self.data.get(self.pos..end).ok_or_else(|| proto("ZRLE data ended early"))?;
        self.pos = end;
        Ok(out)
    }

    fn u8(&mut self) -> Result<u8, SshError> {
        Ok(self.take(1)?[0])
    }

    fn rgb(&mut self) -> Result<[u8; 3], SshError> {
        let p = self.take(3)?;
        Ok([p[0], p[1], p[2]])
    }

    fn run(&mut self) -> Result<u32, SshError> {
        let mut run = 1u32;
        loop {
            let b = self.u8()?;
            run += b as u32;
            if b != 255 {
                return Ok(run);
            }
        }
    }
}

pub(crate) async fn decode_zrle<R: AsyncRead + Unpin>(
    r: &mut R,
    zrle: &mut Zrle,
    fb: &mut Framebuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<(), SshError> {
    let len = r.read_u32().await? as usize;
    let mut compressed = vec![0u8; len];
    r.read_exact(&mut compressed).await?;
    let data = zrle.inflate(&compressed)?;
    let mut c = Bytes { data: &data, pos: 0 };
    let mut palette = Vec::with_capacity(128);
    for ty in (y..y + h).step_by(64) {
        for tx in (x..x + w).step_by(64) {
            let tw = 64.min(x + w - tx);
            let th = 64.min(y + h - ty);
            let sub = c.u8()?;
            match sub {
                0 => {
                    for dy in 0..th {
                        for dx in 0..tw {
                            let p = c.rgb()?;
                            fb.put(tx + dx, ty + dy, p);
                        }
                    }
                }
                1 => {
                    let p = c.rgb()?;
                    fb.fill(tx, ty, tw, th, p);
                }
                2..=16 => {
                    palette.clear();
                    for _ in 0..sub {
                        palette.push(c.rgb()?);
                    }
                    let bits = if sub == 2 { 1 } else if sub <= 4 { 2 } else { 4 };
                    for dy in 0..th {
                        let (mut byte, mut left) = (0u8, 0u32);
                        for dx in 0..tw {
                            if left == 0 {
                                byte = c.u8()?;
                                left = 8;
                            }
                            left -= bits;
                            let i = ((byte >> left) & ((1 << bits) - 1)) as usize;
                            fb.put(tx + dx, ty + dy, palette.get(i).copied().unwrap_or_default());
                        }
                    }
                }
                128 | 130..=255 => {
                    palette.clear();
                    let paletted = sub >= 130;
                    if paletted {
                        for _ in 0..sub - 128 {
                            palette.push(c.rgb()?);
                        }
                    }
                    let total = tw * th;
                    let mut done = 0;
                    while done < total {
                        let (color, run) = if paletted {
                            let i = c.u8()?;
                            let run = if i & 128 != 0 { c.run()? } else { 1 };
                            (palette.get((i & 127) as usize).copied().unwrap_or_default(), run)
                        } else {
                            let p = c.rgb()?;
                            (p, c.run()?)
                        };
                        for _ in 0..run.min(total - done) {
                            fb.put(tx + done % tw, ty + done / tw, color);
                            done += 1;
                        }
                    }
                }
                other => return Err(proto(format!("Unknown ZRLE subencoding {other}"))),
            }
        }
    }
    Ok(())
}

/// The 32 bit RGBX pixel format, red in the lowest byte.
fn pixel_format() -> [u8; 20] {
    let mut m = [0u8; 20];
    m[4] = 32;
    m[5] = 24;
    m[7] = 1;
    m[8..14].copy_from_slice(&[0, 255, 0, 255, 0, 255]);
    m[14] = 0;
    m[15] = 8;
    m[16] = 16;
    m
}

fn update_request(incremental: bool, w: u32, h: u32) -> [u8; 10] {
    let mut b = [0u8; 10];
    b[0] = 3;
    b[1] = incremental as u8;
    b[6..8].copy_from_slice(&(w as u16).to_be_bytes());
    b[8..10].copy_from_slice(&(h as u16).to_be_bytes());
    b
}

/// Latin-1, as ClientCutText expects; anything else becomes "?".
pub(crate) fn latin1(text: &str) -> Vec<u8> {
    text.replace("\r\n", "\n").chars().map(|c| if (c as u32) < 256 { c as u8 } else { b'?' }).collect()
}

struct Shared {
    width: u32,
    height: u32,
    extended: bool,
    screen: u32,
}

type Writer = Arc<Mutex<WriteHalf<Conn>>>;

pub(crate) async fn start(
    conn: Conn,
    config: &DisplayConfig,
    input: mpsc::UnboundedReceiver<Input>,
    cb: Arc<dyn DisplayCallbacks>,
) -> Result<(), SshError> {
    let (read, mut write) = tokio::io::split(conn);
    let mut r = BufReader::with_capacity(64 * 1024, read);
    let username = config.username.clone().unwrap_or_default();
    let password = config.password.clone().unwrap_or_default();

    let mut banner = [0u8; 12];
    r.read_exact(&mut banner).await?;
    let (minor, reply) = choose_version(&banner)?;
    write.write_all(reply).await?;

    let kind = if minor == 3 {
        match r.read_u32().await? {
            0 => return Err(proto(reason(&mut r).await?)),
            t => t as u8,
        }
    } else {
        let count = r.read_u8().await? as usize;
        if count == 0 {
            return Err(proto(reason(&mut r).await?));
        }
        let mut offered = vec![0u8; count];
        r.read_exact(&mut offered).await?;
        let chosen = choose_security(&offered, &username, &password)
            .ok_or_else(|| proto("The VNC server offers no login this app supports yet"))?;
        write.write_all(&[chosen]).await?;
        chosen
    };
    match kind {
        SEC_NONE => {
            if minor == 8 {
                auth_result(&mut r, minor).await?;
            }
        }
        SEC_VNC => {
            if password.is_empty() {
                return Err(SshError::Auth { msg: "The VNC server needs a password".into() });
            }
            let mut challenge = [0u8; 16];
            r.read_exact(&mut challenge).await?;
            write.write_all(&vnc_auth_response(&password, &challenge)).await?;
            auth_result(&mut r, minor).await?;
        }
        SEC_ARD => {
            let mut generator = [0u8; 2];
            r.read_exact(&mut generator).await?;
            let len = r.read_u16().await? as usize;
            let (mut prime, mut server_key) = (vec![0u8; len], vec![0u8; len]);
            r.read_exact(&mut prime).await?;
            r.read_exact(&mut server_key).await?;
            let mut private = vec![0u8; len];
            rand::fill(&mut private[..]);
            write.write_all(&ard_response(&generator, &prime, &server_key, &username, &password, &private)).await?;
            auth_result(&mut r, minor).await?;
        }
        other => return Err(proto(format!("VNC login type {other} is not supported yet"))),
    }

    write.write_all(&[1]).await?; // shared
    let width = r.read_u16().await? as u32;
    let height = r.read_u16().await? as u32;
    let mut skip = [0u8; 16];
    r.read_exact(&mut skip).await?;
    let name_len = r.read_u32().await? as usize;
    let mut name = vec![0u8; name_len.min(4096)];
    r.read_exact(&mut name).await?;

    write.write_all(&pixel_format()).await?;
    let mut enc = vec![2, 0];
    enc.extend((ENCODINGS.len() as u16).to_be_bytes());
    for e in ENCODINGS {
        enc.extend(e.to_be_bytes());
    }
    write.write_all(&enc).await?;
    write.write_all(&update_request(false, width, height)).await?;

    let shared = Arc::new(std::sync::Mutex::new(Shared { width, height, extended: false, screen: 0 }));
    let writer: Writer = Arc::new(Mutex::new(write));
    cb.on_resize(width, height);
    let fb = Framebuffer::new(width, height);
    tokio::spawn(read_loop(r, fb, writer.clone(), shared.clone(), cb.clone()));
    tokio::spawn(input_loop(input, writer, shared));
    Ok(())
}

async fn read_loop(
    mut r: BufReader<ReadHalf<Conn>>,
    mut fb: Framebuffer,
    writer: Writer,
    shared: Arc<std::sync::Mutex<Shared>>,
    cb: Arc<dyn DisplayCallbacks>,
) {
    let mut zrle = Zrle::new();
    let result: Result<(), SshError> = async {
        loop {
            match r.read_u8().await? {
                0 => {
                    let mut damage = Damage::default();
                    let resized = update(&mut r, &mut fb, &mut zrle, &mut damage, &shared).await?;
                    if resized {
                        cb.on_resize(fb.width, fb.height);
                        damage.add(0, 0, fb.width, fb.height);
                    }
                    damage.flush(&*cb, &fb.px, fb.width, fb.height);
                    let req = update_request(true, fb.width, fb.height);
                    writer.lock().await.write_all(&req).await?;
                }
                1 => {
                    let mut head = [0u8; 5];
                    r.read_exact(&mut head).await?;
                    let count = u16::from_be_bytes([head[3], head[4]]) as usize;
                    let mut skip = vec![0u8; count * 6];
                    r.read_exact(&mut skip).await?;
                }
                2 | 150 => {}
                3 => {
                    let mut pad = [0u8; 3];
                    r.read_exact(&mut pad).await?;
                    let len = r.read_i32().await?;
                    let mut text = vec![0u8; len.unsigned_abs() as usize];
                    r.read_exact(&mut text).await?;
                    // A negative length is the extended clipboard, which isn't asked for.
                    if len > 0 {
                        cb.on_clipboard(text.iter().map(|&b| b as char).collect());
                    }
                }
                other => return Err(proto(format!("Unknown VNC message {other}"))),
            }
        }
    }
    .await;
    cb.on_closed(Some(match result {
        Err(SshError::Io { .. }) | Ok(()) => "The VNC server closed the connection".into(),
        Err(e) => e.to_string(),
    }));
}

/// Reads one FramebufferUpdate. True when the framebuffer changed size.
async fn update<R: AsyncRead + Unpin>(
    r: &mut R,
    fb: &mut Framebuffer,
    zrle: &mut Zrle,
    damage: &mut Damage,
    shared: &std::sync::Mutex<Shared>,
) -> Result<bool, SshError> {
    r.read_u8().await?;
    let count = r.read_u16().await?;
    let mut resized = false;
    for _ in 0..count {
        let x = r.read_u16().await? as u32;
        let y = r.read_u16().await? as u32;
        let w = r.read_u16().await? as u32;
        let h = r.read_u16().await? as u32;
        match r.read_i32().await? {
            ENC_RAW => decode_raw(r, fb, x, y, w, h).await?,
            ENC_COPYRECT => {
                let sx = r.read_u16().await? as u32;
                let sy = r.read_u16().await? as u32;
                fb.copy(sx, sy, w, h, x, y);
            }
            ENC_HEXTILE => decode_hextile(r, fb, x, y, w, h).await?,
            ENC_ZRLE => decode_zrle(r, zrle, fb, x, y, w, h).await?,
            ENC_DESKTOP_SIZE => {
                *fb = Framebuffer::new(w, h);
                resized = true;
            }
            ENC_EXTENDED_DESKTOP_SIZE => {
                let screens = r.read_u8().await? as usize;
                let mut rest = vec![0u8; 3 + screens * 16];
                r.read_exact(&mut rest).await?;
                let mut s = shared.lock().unwrap();
                s.extended = true;
                if screens > 0 {
                    s.screen = u32::from_be_bytes([rest[3], rest[4], rest[5], rest[6]]);
                }
                // y carries the status; a refused resize keeps the old size.
                if x != 1 || y == 0 {
                    *fb = Framebuffer::new(w, h);
                    resized = true;
                }
            }
            ENC_LAST_RECT => break,
            other => return Err(proto(format!("The VNC server sent encoding {other}"))),
        }
        damage.add(x, y, w, h);
    }
    if resized {
        let mut s = shared.lock().unwrap();
        s.width = fb.width;
        s.height = fb.height;
    }
    Ok(resized)
}

async fn input_loop(mut rx: mpsc::UnboundedReceiver<Input>, writer: Writer, shared: Arc<std::sync::Mutex<Shared>>) {
    while let Some(input) = rx.recv().await {
        let bytes = {
            let s = shared.lock().unwrap();
            match input {
                Input::Close => break,
                other => encode_input(&other, &s),
            }
        };
        if !bytes.is_empty() && writer.lock().await.write_all(&bytes).await.is_err() {
            break;
        }
    }
    writer.lock().await.shutdown().await.ok();
}

fn encode_input(input: &Input, s: &Shared) -> Vec<u8> {
    match input {
        Input::Pointer { x, y, buttons } => {
            let x = (*x).min(s.width.saturating_sub(1)) as u16;
            let y = (*y).min(s.height.saturating_sub(1)) as u16;
            let mut b = vec![5, *buttons];
            b.extend(x.to_be_bytes());
            b.extend(y.to_be_bytes());
            b
        }
        Input::KeySym { sym, down } => key_event(*sym, *down),
        Input::Unicode { ch, down } => key_event(keysym_for(*ch), *down),
        Input::Clipboard(text) => {
            let data = latin1(text);
            let mut b = vec![6, 0, 0, 0];
            b.extend((data.len() as u32).to_be_bytes());
            b.extend(data);
            b
        }
        Input::Resize { width, height, .. } => {
            if !s.extended || (*width == s.width && *height == s.height) || *width == 0 || *height == 0 {
                return Vec::new();
            }
            let mut b = vec![251, 0];
            b.extend((*width as u16).to_be_bytes());
            b.extend((*height as u16).to_be_bytes());
            b.extend([1, 0]);
            b.extend(s.screen.to_be_bytes());
            b.extend([0, 0, 0, 0]);
            b.extend((*width as u16).to_be_bytes());
            b.extend((*height as u16).to_be_bytes());
            b.extend([0, 0, 0, 0]);
            b
        }
        Input::Refresh => update_request(false, s.width, s.height).to_vec(),
        Input::Close => Vec::new(),
    }
}

fn key_event(sym: u32, down: bool) -> Vec<u8> {
    let mut b = vec![4, down as u8, 0, 0];
    b.extend(sym.to_be_bytes());
    b
}

/// The keysym for a character: Latin-1 maps directly, the rest uses the Unicode range.
pub(crate) fn keysym_for(ch: u32) -> u32 {
    match ch {
        0x0a | 0x0d => 0xff0d,
        0x08 => 0xff08,
        0x09 => 0xff09,
        0x1b => 0xff1b,
        0x20..=0x7e | 0xa0..=0xff => ch,
        _ => 0x0100_0000 | ch,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_and_logins() {
        assert_eq!(choose_version(b"RFB 003.889\n").unwrap().0, 8);
        assert_eq!(choose_version(b"RFB 003.007\n").unwrap().0, 7);
        assert_eq!(choose_version(b"RFB 003.003\n").unwrap().0, 3);
        assert!(choose_version(b"SSH-2.0-xx\r\n").is_err());
        assert_eq!(choose_security(&[1, 2], "", ""), Some(SEC_NONE));
        assert_eq!(choose_security(&[1, 2], "", "pw"), Some(SEC_VNC));
        assert_eq!(choose_security(&[2, 30], "me", "pw"), Some(SEC_ARD));
        assert_eq!(choose_security(&[19], "", "pw"), None);
    }

    #[test]
    fn vnc_auth_matches_the_plugin() {
        // Worked out with the plugin's DES for the same password and challenge.
        let challenge: [u8; 16] = std::array::from_fn(|i| (i * 17) as u8);
        let want = hex::decode("b7b9c87777661a7a2299733209bfdfce").unwrap();
        assert_eq!(vnc_auth_response("password", &challenge).to_vec(), want);
        // Only the first 8 password bytes count.
        assert_eq!(vnc_auth_response("password-long", &challenge).to_vec(), want);
    }

    #[test]
    fn ard_response_decrypts_with_the_shared_secret() {
        use aes::cipher::{BlockDecrypt, KeyInit};
        use md5::Digest;
        use num_bigint::BigUint;
        let prime = [0xff, 0xff, 0xff, 0xfb]; // small prime, enough for the math
        let generator = [0, 2];
        let server_private = BigUint::from(12345u32);
        let p = BigUint::from_bytes_be(&prime);
        let server_key = pad(BigUint::from(2u32).modpow(&server_private, &p).to_bytes_be(), 4);
        let out = ard_response(&generator, &prime, &server_key, "me", "secret", &[7, 7, 7, 7]);
        assert_eq!(out.len(), 128 + 4);
        let client_key = BigUint::from_bytes_be(&out[128..]);
        let secret = pad(client_key.modpow(&server_private, &p).to_bytes_be(), 4);
        let key = md5::Md5::digest(&secret);
        let cipher = aes::Aes128::new_from_slice(&key).unwrap();
        let mut creds = out[..128].to_vec();
        for block in creds.chunks_mut(16) {
            cipher.decrypt_block(block.into());
        }
        assert_eq!(&creds[..3], b"me\0");
        assert_eq!(&creds[64..71], b"secret\0");
    }

    fn fb_at(fb: &Framebuffer, x: u32, y: u32) -> [u8; 4] {
        let o = ((y * fb.width + x) * 4) as usize;
        fb.px[o..o + 4].try_into().unwrap()
    }

    #[tokio::test]
    async fn raw_and_copyrect() {
        let mut fb = Framebuffer::new(4, 2);
        let data: Vec<u8> = [[1, 2, 3, 0], [4, 5, 6, 0]].concat();
        decode_raw(&mut data.as_slice(), &mut fb, 1, 0, 2, 1).await.unwrap();
        assert_eq!(fb_at(&fb, 2, 0), [4, 5, 6, 255]);
        fb.copy(1, 0, 2, 1, 2, 1);
        assert_eq!(fb_at(&fb, 3, 1), [4, 5, 6, 255]);
        // Out of bounds copies are ignored instead of panicking.
        fb.copy(3, 1, 4, 4, 0, 0);
    }

    #[tokio::test]
    async fn hextile_background_and_subrects() {
        let mut fb = Framebuffer::new(16, 16);
        // bg + fg + any subrects, one 2x1 subrect at (1,1).
        let mut data = vec![2 | 4 | 8];
        data.extend([9, 9, 9, 0]);
        data.extend([200, 0, 0, 0]);
        data.extend([1, 0x11, 0x10]);
        decode_hextile(&mut data.as_slice(), &mut fb, 0, 0, 16, 16).await.unwrap();
        assert_eq!(fb_at(&fb, 0, 0), [9, 9, 9, 255]);
        assert_eq!(fb_at(&fb, 1, 1), [200, 0, 0, 255]);
        assert_eq!(fb_at(&fb, 2, 1), [200, 0, 0, 255]);
        assert_eq!(fb_at(&fb, 3, 1), [9, 9, 9, 255]);
    }

    fn zlib(data: &[u8], z: &mut flate2::Compress) -> Vec<u8> {
        let mut out = Vec::with_capacity(data.len() + 64);
        z.compress_vec(data, &mut out, flate2::FlushCompress::Sync).unwrap();
        out
    }

    #[tokio::test]
    async fn zrle_solid_palette_and_rle_across_one_stream() {
        let mut z = flate2::Compress::new(flate2::Compression::default(), true);
        let mut zrle = Zrle::new();
        let mut fb = Framebuffer::new(4, 2);

        let solid = zlib(&[1, 10, 20, 30], &mut z);
        let mut msg = (solid.len() as u32).to_be_bytes().to_vec();
        msg.extend(solid);
        decode_zrle(&mut msg.as_slice(), &mut zrle, &mut fb, 0, 0, 4, 2).await.unwrap();
        assert_eq!(fb_at(&fb, 3, 1), [10, 20, 30, 255]);

        // Two color palette, 1 bit per pixel: row 0 = 1010, row 1 = 0101.
        let packed = zlib(&[2, 1, 1, 1, 9, 9, 9, 0b1010_0000, 0b0101_0000], &mut z);
        let mut msg = (packed.len() as u32).to_be_bytes().to_vec();
        msg.extend(packed);
        decode_zrle(&mut msg.as_slice(), &mut zrle, &mut fb, 0, 0, 4, 2).await.unwrap();
        assert_eq!(fb_at(&fb, 0, 0), [9, 9, 9, 255]);
        assert_eq!(fb_at(&fb, 1, 0), [1, 1, 1, 255]);
        assert_eq!(fb_at(&fb, 1, 1), [9, 9, 9, 255]);

        // Plain RLE: 5 red then 3 blue.
        let rle = zlib(&[128, 255, 0, 0, 4, 0, 0, 255, 2], &mut z);
        let mut msg = (rle.len() as u32).to_be_bytes().to_vec();
        msg.extend(rle);
        decode_zrle(&mut msg.as_slice(), &mut zrle, &mut fb, 0, 0, 4, 2).await.unwrap();
        assert_eq!(fb_at(&fb, 0, 1), [255, 0, 0, 255]);
        assert_eq!(fb_at(&fb, 1, 1), [0, 0, 255, 255]);
    }

    #[test]
    fn input_encoding() {
        let s = Shared { width: 100, height: 50, extended: false, screen: 0 };
        assert_eq!(encode_input(&Input::Pointer { x: 500, y: 7, buttons: 1 }, &s), [5, 1, 0, 99, 0, 7]);
        assert_eq!(encode_input(&Input::Unicode { ch: 'é' as u32, down: true }, &s), [4, 1, 0, 0, 0, 0, 0, 0xe9]);
        assert_eq!(keysym_for('€' as u32), 0x0100_20ac);
        assert!(encode_input(&Input::Resize { width: 10, height: 10, scale: 0 }, &s).is_empty());
        assert_eq!(latin1("a€\r\nb"), b"a?\nb");
    }

    #[tokio::test]
    async fn logs_in_and_draws_over_tcp() {
        use crate::display::DisplayProtocol;
        use crate::remote::DialConfig;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut tcp, _) = listener.accept().await.unwrap();
            tcp.write_all(b"RFB 003.008\n").await.unwrap();
            let mut v = [0u8; 12];
            tcp.read_exact(&mut v).await.unwrap();
            tcp.write_all(&[1, SEC_NONE]).await.unwrap();
            let mut chosen = [0u8; 1];
            tcp.read_exact(&mut chosen).await.unwrap();
            tcp.write_all(&0u32.to_be_bytes()).await.unwrap();
            let mut shared = [0u8; 1];
            tcp.read_exact(&mut shared).await.unwrap();
            let mut init = vec![0, 2, 0, 1];
            init.extend([0u8; 16]);
            init.extend(1u32.to_be_bytes());
            init.push(b'x');
            tcp.write_all(&init).await.unwrap();
            let mut update = vec![0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1];
            update.extend(ENC_RAW.to_be_bytes());
            update.extend([7, 8, 9, 0]);
            tcp.write_all(&update).await.unwrap();
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        });
        struct Cb(std::sync::Mutex<Vec<String>>);
        impl DisplayCallbacks for Cb {
            fn on_resize(&self, w: u32, h: u32) {
                self.0.lock().unwrap().push(format!("size {w}x{h}"));
            }
            fn on_frame(&self, x: u32, y: u32, w: u32, h: u32, rgba: Vec<u8>) {
                self.0.lock().unwrap().push(format!("frame {x},{y} {w}x{h} {rgba:?}"));
            }
            fn on_clipboard(&self, _: String) {}
            fn on_closed(&self, _: Option<String>) {}
        }
        let cb = Arc::new(Cb(Default::default()));
        let config = DisplayConfig {
            dial: DialConfig { host: "127.0.0.1".into(), port, proxies: vec![], connect_timeout_secs: 5 },
            protocol: DisplayProtocol::Vnc,
            username: None,
            password: None,
            domain: None,
            width: 0,
            height: 0,
            scale: 0,
            security: String::new(),
            server_cert: None,
        };
        let display = crate::display::open_display(config, None, cb.clone()).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let events = cb.0.lock().unwrap().clone();
        assert_eq!(events, ["size 2x1", "frame 1,0 1x1 [7, 8, 9, 255]"]);
        display.stop();
    }
}
