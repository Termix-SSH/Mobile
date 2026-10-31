use std::borrow::Cow;

use russh::keys::{Algorithm, EcdsaCurve, HashAlg};
use russh::{cipher, kex, mac, Preferred};

// Same lists as core's buildSSHAlgorithms in src/backend/utils/ssh-algorithms.ts.
const KEX: &[kex::Name] = &[
    kex::MLKEM768X25519_SHA256,
    kex::CURVE25519,
    kex::CURVE25519_PRE_RFC_8731,
    kex::ECDH_SHA2_NISTP521,
    kex::ECDH_SHA2_NISTP384,
    kex::ECDH_SHA2_NISTP256,
    kex::DH_GEX_SHA256,
    kex::DH_G18_SHA512,
    kex::DH_G17_SHA512,
    kex::DH_G16_SHA512,
    kex::DH_G15_SHA512,
    kex::DH_G14_SHA256,
    kex::EXTENSION_SUPPORT_AS_CLIENT,
    kex::EXTENSION_OPENSSH_STRICT_KEX_AS_CLIENT,
];

const KEX_LEGACY: &[kex::Name] = &[kex::DH_G14_SHA1, kex::DH_GEX_SHA1, kex::DH_G1_SHA1];

const CIPHERS: &[cipher::Name] = &[
    cipher::CHACHA20_POLY1305,
    cipher::AES_256_GCM,
    cipher::AES_128_GCM,
    cipher::AES_256_CTR,
    cipher::AES_192_CTR,
    cipher::AES_128_CTR,
    cipher::AES_256_CBC,
    cipher::AES_192_CBC,
    cipher::AES_128_CBC,
];

const CIPHERS_LEGACY: &[cipher::Name] = &[cipher::TRIPLE_DES_CBC];

const MACS: &[mac::Name] = &[
    mac::HMAC_SHA512_ETM,
    mac::HMAC_SHA256_ETM,
    mac::HMAC_SHA512,
    mac::HMAC_SHA256,
];

const MACS_LEGACY: &[mac::Name] = &[mac::HMAC_SHA1_ETM, mac::HMAC_SHA1];

fn host_keys(legacy: bool) -> Vec<Algorithm> {
    let mut keys = vec![
        Algorithm::Ed25519,
        Algorithm::Ecdsa { curve: EcdsaCurve::NistP521 },
        Algorithm::Ecdsa { curve: EcdsaCurve::NistP384 },
        Algorithm::Ecdsa { curve: EcdsaCurve::NistP256 },
        Algorithm::Rsa { hash: Some(HashAlg::Sha512) },
        Algorithm::Rsa { hash: Some(HashAlg::Sha256) },
    ];
    if legacy {
        keys.push(Algorithm::Rsa { hash: None });
    }
    keys
}

fn pick<T: Clone>(base: &[T], extra: &[T], legacy: bool) -> Vec<T> {
    let mut v = base.to_vec();
    if legacy {
        v.extend_from_slice(extra);
    }
    v
}

pub fn preferred(legacy: bool) -> Preferred {
    Preferred {
        kex: Cow::Owned(pick(KEX, KEX_LEGACY, legacy)),
        key: Cow::Owned(host_keys(legacy)),
        // Lets a server prove itself with a host certificate; the app decides trust.
        host_key_certificates: Cow::Owned(vec![
            Algorithm::Ed25519,
            Algorithm::Ecdsa { curve: EcdsaCurve::NistP256 },
            Algorithm::Rsa { hash: Some(HashAlg::Sha512) },
        ]),
        cipher: Cow::Owned(pick(CIPHERS, CIPHERS_LEGACY, legacy)),
        mac: Cow::Owned(pick(MACS, MACS_LEGACY, legacy)),
        compression: Preferred::DEFAULT.compression,
    }
}
