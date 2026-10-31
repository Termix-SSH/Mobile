//! Telnet (RFC 854) for the terminal view. Output goes through the same `ShellCallbacks` as an SSH
//! shell, so pipes and back pressure work the same way.

use std::sync::Arc;

use tokio::io::{AsyncReadExt, AsyncWriteExt, ReadHalf, WriteHalf};
use tokio::sync::{watch, Mutex};

use crate::remote::{self, Conn, DialConfig};
use crate::shell::wait_unpaused;
use crate::{Session, ShellCallbacks, SshError};

const IAC: u8 = 255;
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;
const SE: u8 = 240;

const BINARY: u8 = 0;
const ECHO: u8 = 1;
const SGA: u8 = 3;
const TTYPE: u8 = 24;
const NAWS: u8 = 31;

const TTYPE_IS: u8 = 0;
const TTYPE_SEND: u8 = 1;

/// Options we turn on for ourselves when asked.
const OURS: &[u8] = &[BINARY, SGA, TTYPE, NAWS];
/// Options we let the server turn on.
const THEIRS: &[u8] = &[BINARY, ECHO, SGA];

#[derive(Debug, Clone, uniffi::Record)]
pub struct TelnetConfig {
    pub dial: DialConfig,
    pub term: String,
    pub cols: u32,
    pub rows: u32,
    /// Typed at the first `login:` prompt.
    pub username: Option<String>,
    /// Typed at the first `password:` prompt after that.
    pub password: Option<String>,
}

#[derive(Default, Clone, Copy, PartialEq, Debug)]
enum Opt {
    #[default]
    Off,
    Asked,
    On,
}

#[derive(Default, PartialEq, Debug)]
enum State {
    #[default]
    Data,
    Cr,
    Iac,
    Verb(u8),
    Sub,
    SubIac,
}

/// The option and byte state machine, kept free of I/O so it can be tested on its own.
pub(crate) struct Telnet {
    state: State,
    us: [Opt; 256],
    him: [Opt; 256],
    sub: Vec<u8>,
    term: String,
    size: (u16, u16),
}

impl Telnet {
    pub(crate) fn new(term: &str, cols: u32, rows: u32) -> Self {
        Self {
            state: State::Data,
            us: [Opt::Off; 256],
            him: [Opt::Off; 256],
            sub: Vec::new(),
            term: term.to_string(),
            size: (clamp16(cols), clamp16(rows)),
        }
    }

    /// What a client says first, so servers that wait for us still negotiate.
    pub(crate) fn hello(&mut self) -> Vec<u8> {
        let mut out = Vec::new();
        for opt in [TTYPE, NAWS] {
            self.us[opt as usize] = Opt::Asked;
            out.extend([IAC, WILL, opt]);
        }
        for opt in [SGA, ECHO] {
            self.him[opt as usize] = Opt::Asked;
            out.extend([IAC, DO, opt]);
        }
        out
    }

    /// Splits server bytes into terminal data and replies to send back.
    pub(crate) fn receive(&mut self, input: &[u8], data: &mut Vec<u8>, reply: &mut Vec<u8>) {
        for &b in input {
            self.state = match std::mem::take(&mut self.state) {
                State::Data => match b {
                    IAC => State::Iac,
                    b'\r' if !self.binary_in() => {
                        data.push(b);
                        State::Cr
                    }
                    _ => {
                        data.push(b);
                        State::Data
                    }
                },
                // CR NUL means a bare CR, so the NUL is dropped.
                State::Cr => match b {
                    0 => State::Data,
                    IAC => State::Iac,
                    _ => {
                        data.push(b);
                        State::Data
                    }
                },
                State::Iac => match b {
                    IAC => {
                        data.push(IAC);
                        State::Data
                    }
                    WILL | WONT | DO | DONT => State::Verb(b),
                    SB => {
                        self.sub.clear();
                        State::Sub
                    }
                    _ => State::Data,
                },
                State::Verb(verb) => {
                    self.negotiate(verb, b, reply);
                    State::Data
                }
                State::Sub => match b {
                    IAC => State::SubIac,
                    _ => {
                        self.push_sub(b);
                        State::Sub
                    }
                },
                State::SubIac => match b {
                    SE => {
                        self.subnegotiate(reply);
                        State::Data
                    }
                    IAC => {
                        self.push_sub(IAC);
                        State::Sub
                    }
                    _ => State::Data,
                },
            };
        }
    }

    fn push_sub(&mut self, b: u8) {
        // A sane subnegotiation is tiny; a runaway one is cut off.
        if self.sub.len() < 512 {
            self.sub.push(b);
        }
    }

    fn negotiate(&mut self, verb: u8, opt: u8, reply: &mut Vec<u8>) {
        let i = opt as usize;
        match verb {
            DO => {
                if OURS.contains(&opt) {
                    if self.us[i] != Opt::On {
                        if self.us[i] == Opt::Off {
                            reply.extend([IAC, WILL, opt]);
                        }
                        self.us[i] = Opt::On;
                    }
                    if opt == NAWS {
                        reply.extend(self.naws());
                    }
                } else {
                    reply.extend([IAC, WONT, opt]);
                }
            }
            DONT => {
                if self.us[i] == Opt::On {
                    reply.extend([IAC, WONT, opt]);
                }
                self.us[i] = Opt::Off;
            }
            WILL => {
                if THEIRS.contains(&opt) {
                    if self.him[i] == Opt::Off {
                        reply.extend([IAC, DO, opt]);
                    }
                    self.him[i] = Opt::On;
                } else {
                    reply.extend([IAC, DONT, opt]);
                }
            }
            WONT => {
                if self.him[i] == Opt::On {
                    reply.extend([IAC, DONT, opt]);
                }
                self.him[i] = Opt::Off;
            }
            _ => {}
        }
    }

    fn subnegotiate(&mut self, reply: &mut Vec<u8>) {
        if self.sub.first() == Some(&TTYPE) && self.sub.get(1) == Some(&TTYPE_SEND) {
            reply.extend([IAC, SB, TTYPE, TTYPE_IS]);
            reply.extend(self.term.as_bytes());
            reply.extend([IAC, SE]);
        }
    }

    fn naws(&self) -> Vec<u8> {
        let mut out = vec![IAC, SB, NAWS];
        for v in [self.size.0, self.size.1] {
            for b in v.to_be_bytes() {
                // A 255 in the size has to be doubled like any other IAC.
                out.push(b);
                if b == IAC {
                    out.push(IAC);
                }
            }
        }
        out.extend([IAC, SE]);
        out
    }

    /// The NAWS update for a new size, or nothing when the server never asked for it.
    pub(crate) fn resize(&mut self, cols: u32, rows: u32) -> Vec<u8> {
        self.size = (clamp16(cols), clamp16(rows));
        if self.us[NAWS as usize] == Opt::On { self.naws() } else { Vec::new() }
    }

    fn binary_in(&self) -> bool {
        self.him[BINARY as usize] == Opt::On
    }

    fn binary_out(&self) -> bool {
        self.us[BINARY as usize] == Opt::On
    }

    /// Escapes typed bytes: IAC doubled, and a bare CR sent as CR NUL unless in binary mode.
    pub(crate) fn encode(&self, input: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(input.len() + 4);
        let binary = self.binary_out();
        let mut i = 0;
        while i < input.len() {
            let b = input[i];
            out.push(b);
            if b == IAC {
                out.push(IAC);
            } else if b == b'\r' && !binary && input.get(i + 1) != Some(&b'\n') {
                out.push(0);
            }
            i += 1;
        }
        out
    }
}

fn clamp16(v: u32) -> u16 {
    v.clamp(1, u16::MAX as u32) as u16
}

/// Types the saved login at the first prompts it sees, like the plugin's Telnet login.
#[derive(Default)]
pub(crate) struct AutoLogin {
    username: Option<String>,
    password: Option<String>,
    tail: Vec<u8>,
}

impl AutoLogin {
    pub(crate) fn new(username: Option<String>, password: Option<String>) -> Self {
        let keep = |s: Option<String>| s.filter(|s| !s.is_empty());
        let username = keep(username);
        // Without a username the password prompt still gets the password.
        Self { username, password: keep(password), tail: Vec::new() }
    }

    fn done(&self) -> bool {
        self.username.is_none() && self.password.is_none()
    }

    /// The line to type for this output, if a prompt just showed up.
    pub(crate) fn feed(&mut self, data: &[u8]) -> Option<String> {
        if self.done() {
            return None;
        }
        self.tail.extend_from_slice(data);
        if self.tail.len() > 256 {
            self.tail.drain(..self.tail.len() - 256);
        }
        let text = String::from_utf8_lossy(&self.tail).to_ascii_lowercase();
        let end = text.trim_end();
        let answer = if end.ends_with("login:") || end.ends_with("username:") {
            self.username.take()
        } else if end.ends_with("password:") {
            // A password prompt ends the chance to send the username.
            self.username = None;
            self.password.take()
        } else {
            None
        };
        if answer.is_some() {
            self.tail.clear();
        }
        answer.map(|s| format!("{s}\r"))
    }
}

#[derive(uniffi::Object)]
pub struct TelnetShell {
    writer: Arc<Mutex<WriteHalf<Conn>>>,
    telnet: Arc<std::sync::Mutex<Telnet>>,
    paused: watch::Sender<bool>,
}

/// Opens a Telnet session. With `via` the SSH host dials it, like a jump host.
#[uniffi::export(async_runtime = "tokio")]
pub async fn connect_telnet(
    config: TelnetConfig,
    via: Option<Arc<Session>>,
    callbacks: Arc<dyn ShellCallbacks>,
) -> Result<Arc<TelnetShell>, SshError> {
    let conn = remote::open(&config.dial, via).await?;
    let (reader, writer) = tokio::io::split(conn);
    let writer = Arc::new(Mutex::new(writer));
    let mut telnet = Telnet::new(&config.term, config.cols, config.rows);
    let hello = telnet.hello();
    writer.lock().await.write_all(&hello).await?;
    let telnet = Arc::new(std::sync::Mutex::new(telnet));
    let (paused, rx) = watch::channel(false);
    let login = AutoLogin::new(config.username, config.password);
    tokio::spawn(read_loop(reader, writer.clone(), telnet.clone(), rx, login, callbacks));
    Ok(Arc::new(TelnetShell { writer, telnet, paused }))
}

async fn read_loop(
    mut reader: ReadHalf<Conn>,
    writer: Arc<Mutex<WriteHalf<Conn>>>,
    telnet: Arc<std::sync::Mutex<Telnet>>,
    mut paused: watch::Receiver<bool>,
    mut login: AutoLogin,
    callbacks: Arc<dyn ShellCallbacks>,
) {
    let mut buf = vec![0u8; 16 * 1024];
    let mut can_pause = true;
    let clean = loop {
        if can_pause && !wait_unpaused(&mut paused).await {
            can_pause = false;
        }
        let n = match reader.read(&mut buf).await {
            Ok(0) => break true,
            Ok(n) => n,
            Err(_) => break false,
        };
        let (mut data, mut reply) = (Vec::new(), Vec::new());
        let typed = {
            let mut t = telnet.lock().unwrap();
            t.receive(&buf[..n], &mut data, &mut reply);
            login.feed(&data).map(|line| t.encode(line.as_bytes()))
        };
        if !reply.is_empty() || typed.is_some() {
            let mut w = writer.lock().await;
            if w.write_all(&reply).await.is_err() {
                break false;
            }
            if let Some(line) = typed
                && w.write_all(&line).await.is_err()
            {
                break false;
            }
        }
        if !data.is_empty() {
            callbacks.on_data(data);
        }
    };
    // A clean close is the remote logging out, not a dropped connection.
    callbacks.on_exit(clean.then_some(0), None);
}

#[uniffi::export(async_runtime = "tokio")]
impl TelnetShell {
    pub async fn write(&self, data: Vec<u8>) -> Result<(), SshError> {
        let bytes = self.telnet.lock().unwrap().encode(&data);
        self.writer.lock().await.write_all(&bytes).await?;
        Ok(())
    }

    pub async fn resize(&self, cols: u32, rows: u32) -> Result<(), SshError> {
        let bytes = self.telnet.lock().unwrap().resize(cols, rows);
        if !bytes.is_empty() {
            self.writer.lock().await.write_all(&bytes).await?;
        }
        Ok(())
    }

    pub fn pause(&self) {
        self.paused.send_replace(true);
    }

    pub fn resume(&self) {
        self.paused.send_replace(false);
    }

    pub async fn end(&self) -> Result<(), SshError> {
        self.resume();
        self.writer.lock().await.shutdown().await.ok();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(t: &mut Telnet, input: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let (mut data, mut reply) = (Vec::new(), Vec::new());
        t.receive(input, &mut data, &mut reply);
        (data, reply)
    }

    #[test]
    fn hello_offers_size_and_terminal() {
        let mut t = Telnet::new("xterm-256color", 80, 24);
        assert_eq!(t.hello(), [IAC, WILL, TTYPE, IAC, WILL, NAWS, IAC, DO, SGA, IAC, DO, ECHO]);
    }

    #[test]
    fn answers_options_once_without_loops() {
        let mut t = Telnet::new("xterm", 80, 24);
        t.hello();
        // Agreeing to what we offered needs no reply, except the size itself.
        let (_, reply) = run(&mut t, &[IAC, DO, TTYPE, IAC, WILL, ECHO, IAC, WILL, SGA]);
        assert!(reply.is_empty());
        let (_, reply) = run(&mut t, &[IAC, DO, NAWS]);
        assert_eq!(reply, [IAC, SB, NAWS, 0, 80, 0, 24, IAC, SE]);
        // Unknown options are refused.
        let (_, reply) = run(&mut t, &[IAC, DO, 39, IAC, WILL, 42]);
        assert_eq!(reply, [IAC, WONT, 39, IAC, DONT, 42]);
        // Asking again changes nothing.
        let (_, reply) = run(&mut t, &[IAC, WILL, ECHO]);
        assert!(reply.is_empty());
    }

    #[test]
    fn sends_terminal_type_on_request() {
        let mut t = Telnet::new("xterm-256color", 80, 24);
        t.hello();
        let (_, reply) = run(&mut t, &[IAC, SB, TTYPE, TTYPE_SEND, IAC, SE]);
        let mut want = vec![IAC, SB, TTYPE, TTYPE_IS];
        want.extend(b"xterm-256color");
        want.extend([IAC, SE]);
        assert_eq!(reply, want);
    }

    #[test]
    fn data_survives_split_commands_and_escapes() {
        let mut t = Telnet::new("xterm", 80, 24);
        let (data, _) = run(&mut t, b"hi\r");
        assert_eq!(data, b"hi\r");
        let (data, _) = run(&mut t, &[0, b'a', IAC]);
        assert_eq!(data, b"a");
        let (data, _) = run(&mut t, &[IAC, b'b']);
        assert_eq!(data, [IAC, b'b']);
        let (data, reply) = run(&mut t, &[IAC]);
        assert!(data.is_empty() && reply.is_empty());
        let (_, reply) = run(&mut t, &[WILL]);
        assert!(reply.is_empty());
        let (_, reply) = run(&mut t, &[77]);
        assert_eq!(reply, [IAC, DONT, 77]);
    }

    #[test]
    fn resize_waits_for_naws_and_escapes_255() {
        let mut t = Telnet::new("xterm", 80, 24);
        assert!(t.resize(100, 30).is_empty());
        run(&mut t, &[IAC, DO, NAWS]);
        assert_eq!(t.resize(255, 30), [IAC, SB, NAWS, 0, 255, 255, 0, 30, IAC, SE]);
    }

    #[test]
    fn encode_escapes_iac_and_bare_cr() {
        let mut t = Telnet::new("xterm", 80, 24);
        assert_eq!(t.encode(&[b'a', IAC, b'\r']), [b'a', IAC, IAC, b'\r', 0]);
        assert_eq!(t.encode(b"\r\n"), b"\r\n");
        run(&mut t, &[IAC, DO, BINARY]);
        assert_eq!(t.encode(b"\r"), b"\r");
    }

    #[test]
    fn auto_login_types_each_answer_once() {
        let mut l = AutoLogin::new(Some("root".into()), Some("pw".into()));
        assert_eq!(l.feed(b"Welcome\r\n"), None);
        assert_eq!(l.feed(b"server Login: "), Some("root\r".into()));
        assert_eq!(l.feed(b"root\r\nPassword:"), Some("pw\r".into()));
        assert_eq!(l.feed(b"\r\nlogin: "), None);
    }

    #[test]
    fn auto_login_skips_the_username_once_a_password_is_asked() {
        let mut l = AutoLogin::new(Some("u".into()), Some("p".into()));
        assert_eq!(l.feed(b"Password: "), Some("p\r".into()));
        assert_eq!(l.feed(b"login: "), None);
        let mut none = AutoLogin::new(Some(String::new()), None);
        assert_eq!(none.feed(b"login: "), None);
    }

    struct Collect {
        data: std::sync::Mutex<Vec<u8>>,
        exit: tokio::sync::mpsc::UnboundedSender<Option<u32>>,
    }

    impl ShellCallbacks for Collect {
        fn on_data(&self, data: Vec<u8>) {
            self.data.lock().unwrap().extend(data);
        }
        fn on_exit(&self, exit_code: Option<u32>, _signal: Option<String>) {
            self.exit.send(exit_code).ok();
        }
    }

    #[tokio::test]
    async fn logs_in_and_ends_cleanly_over_tcp() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut tcp, _) = listener.accept().await.unwrap();
            let mut hello = [0u8; 12];
            tcp.read_exact(&mut hello).await.unwrap();
            tcp.write_all(b"login: ").await.unwrap();
            let mut user = [0u8; 4];
            tcp.read_exact(&mut user).await.unwrap();
            tcp.write_all(&[b'o', b'k', IAC, IAC]).await.unwrap();
            let mut typed = [0u8; 3];
            tcp.read_exact(&mut typed).await.unwrap();
            (user, typed)
        });
        let (exit, mut exited) = tokio::sync::mpsc::unbounded_channel();
        let cb = Arc::new(Collect { data: Default::default(), exit });
        let shell = connect_telnet(
            TelnetConfig {
                dial: DialConfig { host: "127.0.0.1".into(), port, proxies: vec![], connect_timeout_secs: 5 },
                term: "xterm".into(),
                cols: 80,
                rows: 24,
                username: Some("me".into()),
                password: None,
            },
            None,
            cb.clone(),
        )
        .await
        .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        shell.write(vec![b'x', b'\r']).await.unwrap();
        let (user, typed) = server.await.unwrap();
        assert_eq!(&user, b"me\r\0");
        assert_eq!(&typed, b"x\r\0");
        assert_eq!(exited.recv().await, Some(Some(0)));
        assert_eq!(cb.data.lock().unwrap().as_slice(), [b"login: ".as_slice(), &[b'o', b'k', IAC]].concat());
    }
}
