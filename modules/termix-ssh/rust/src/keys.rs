//! Key tools for the login editor: read a key, turn PuTTY keys into OpenSSH, read a certificate.

use russh::keys::ssh_key::public::KeyData;
use russh::keys::ssh_key::LineEnding;
use russh::keys::{Certificate, HashAlg, PublicKey};

use crate::session::load_key;
use crate::SshError;

#[derive(Debug, Clone, uniffi::Record)]
pub struct KeyInfo {
    /// Like `ssh-ed25519` or `rsa-sha2-512`.
    pub key_type: String,
    pub bits: u32,
    pub sha256: String,
    /// The `authorized_keys` line for this key.
    pub public_openssh: String,
    /// The text needed a passphrase.
    pub encrypted: bool,
    /// `openssh`, `pem`, `pkcs8` or `ppk`.
    pub format: String,
    pub comment: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CertInfo {
    pub key_type: String,
    pub key_id: String,
    pub serial: u64,
    pub principals: Vec<String>,
    /// Unix seconds. `valid_before` is u64::MAX for "forever".
    pub valid_after: u64,
    pub valid_before: u64,
    pub ca_sha256: String,
    pub is_host: bool,
}

fn format_of(text: &str) -> &'static str {
    let t = text.trim_start();
    if t.starts_with("PuTTY-User-Key-File-") {
        "ppk"
    } else if t.contains("BEGIN OPENSSH PRIVATE KEY") {
        "openssh"
    } else if t.contains("BEGIN PRIVATE KEY") || t.contains("BEGIN ENCRYPTED PRIVATE KEY") {
        "pkcs8"
    } else {
        "pem"
    }
}

fn bits(key: &PublicKey) -> u32 {
    match key.key_data() {
        KeyData::Rsa(rsa) => rsa.n().as_positive_bytes().map(|b| b.len() as u32 * 8).unwrap_or(0),
        KeyData::Ecdsa(ec) => match ec.curve().as_str() {
            "nistp384" => 384,
            "nistp521" => 521,
            _ => 256,
        },
        KeyData::Dsa(_) => 1024,
        _ => 256,
    }
}

fn needs_passphrase(text: &str) -> bool {
    matches!(load_key(text, None), Err(SshError::PassphraseRequired))
}

/// Reads a private key. Fails with PassphraseRequired or BadPassphrase when it needs one.
#[uniffi::export]
pub fn inspect_key(text: String, passphrase: Option<String>) -> Result<KeyInfo, SshError> {
    let key = load_key(&text, passphrase.as_deref().filter(|p| !p.is_empty()))?;
    let public = key.public_key();
    Ok(KeyInfo {
        key_type: key.algorithm().as_str().to_string(),
        bits: bits(public),
        sha256: public.fingerprint(HashAlg::Sha256).to_string(),
        public_openssh: public.to_openssh().map_err(|e| SshError::InvalidKey { msg: e.to_string() })?,
        encrypted: needs_passphrase(&text),
        format: format_of(&text).into(),
        comment: key.comment().to_string(),
    })
}

/// Returns the key as OpenSSH text, so PuTTY, PEM and PKCS8 keys are stored one way.
/// A non-empty `new_passphrase` encrypts the result.
#[uniffi::export]
pub fn convert_key_to_openssh(
    text: String,
    passphrase: Option<String>,
    new_passphrase: Option<String>,
) -> Result<String, SshError> {
    let key = load_key(&text, passphrase.as_deref().filter(|p| !p.is_empty()))?;
    let bad = |e: russh::keys::ssh_key::Error| SshError::InvalidKey { msg: e.to_string() };
    let out = match new_passphrase.as_deref().filter(|p| !p.is_empty()) {
        Some(p) => key.encrypt(&mut rand::rng(), p).map_err(bad)?.to_openssh(LineEnding::LF),
        None => key.to_openssh(LineEnding::LF),
    }
    .map_err(bad)?;
    Ok(out.to_string())
}

/// Reads an OpenSSH certificate (`*-cert.pub` text).
#[uniffi::export]
pub fn inspect_certificate(text: String) -> Result<CertInfo, SshError> {
    let cert = Certificate::from_openssh(text.trim())
        .map_err(|e| SshError::InvalidKey { msg: e.to_string() })?;
    let ca = PublicKey::from(cert.signature_key().clone());
    Ok(CertInfo {
        key_type: cert.algorithm().to_certificate_type(),
        key_id: cert.key_id().to_string(),
        serial: cert.serial(),
        principals: cert.valid_principals().to_vec(),
        valid_after: cert.valid_after(),
        valid_before: cert.valid_before(),
        ca_sha256: ca.fingerprint(HashAlg::Sha256).to_string(),
        is_host: cert.cert_type().is_host(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh::keys::ssh_key::PrivateKey;
    use russh::keys::Algorithm;

    fn fresh(alg: Algorithm) -> String {
        let k = PrivateKey::random(&mut rand::rng(), alg).unwrap();
        k.to_openssh(LineEnding::LF).unwrap().to_string()
    }

    #[test]
    fn inspects_plain_keys() {
        let info = inspect_key(fresh(Algorithm::Ed25519), None).unwrap();
        assert_eq!(info.key_type, "ssh-ed25519");
        assert_eq!(info.bits, 256);
        assert_eq!(info.format, "openssh");
        assert!(!info.encrypted);
        assert!(info.sha256.starts_with("SHA256:"));
        assert!(info.public_openssh.starts_with("ssh-ed25519 "));
    }

    #[test]
    fn encrypt_then_read_back() {
        let plain = fresh(Algorithm::Ed25519);
        let locked = convert_key_to_openssh(plain.clone(), None, Some("pw".into())).unwrap();
        assert!(matches!(inspect_key(locked.clone(), None), Err(SshError::PassphraseRequired)));
        assert!(matches!(inspect_key(locked.clone(), Some("nope".into())), Err(SshError::BadPassphrase)));
        let info = inspect_key(locked.clone(), Some("pw".into())).unwrap();
        assert!(info.encrypted);
        assert_eq!(info.sha256, inspect_key(plain, None).unwrap().sha256);
        let open = convert_key_to_openssh(locked, Some("pw".into()), None).unwrap();
        assert!(!inspect_key(open, None).unwrap().encrypted);
    }

    #[test]
    fn rejects_garbage() {
        assert!(matches!(inspect_key("nope".into(), None), Err(SshError::InvalidKey { .. })));
        assert!(inspect_certificate("ssh-ed25519 AAAA".into()).is_err());
    }

    #[test]
    fn detects_format() {
        assert_eq!(format_of("PuTTY-User-Key-File-3: ssh-ed25519\n"), "ppk");
        assert_eq!(format_of("-----BEGIN RSA PRIVATE KEY-----"), "pem");
        assert_eq!(format_of("-----BEGIN PRIVATE KEY-----"), "pkcs8");
    }
}
