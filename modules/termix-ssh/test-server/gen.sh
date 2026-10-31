#!/bin/sh
# Makes throwaway keys for the test servers and the clients. Never use them anywhere else.
set -eu
out=${1:-/out}
mkdir -p "$out"
[ -f "$out/done" ] && exit 0
cd "$out"
k() { ssh-keygen -q -t "$1" ${2:+-b "$2"} -N "${4:-}" -C "termix-test" -f "$3"; }
k ed25519 "" ca
k ed25519 "" id_ed25519
k ed25519 "" id_ed25519_pass termix-key
k rsa 3072 id_rsa
k rsa 3072 id_rsa_pass termix-key
k ecdsa 256 id_ecdsa256
k ecdsa 384 id_ecdsa384
k ecdsa 521 id_ecdsa521
k ed25519 "" id_cert
ssh-keygen -q -s ca -I termix-cert -n cert -V -5m:+3650d id_cert.pub
k ed25519 "" host_ed25519
k ecdsa 256 host_ecdsa
k rsa 3072 host_rsa
ssh-keygen -q -s ca -h -I termix-host -n target,localhost,127.0.0.1,10.0.2.2 -V -5m:+3650d host_ed25519.pub
puttygen id_rsa -O private -o id_rsa.ppk --ppk-param version=2
puttygen id_ed25519 -O private -o id_ed25519.ppk
cat id_ed25519.pub id_ed25519_pass.pub id_rsa.pub id_rsa_pass.pub id_ecdsa256.pub id_ecdsa384.pub id_ecdsa521.pub > authorized_keys
# Fixed TOTP secret so tests can make codes with oathtool or their own HMAC.
echo "JBSWY3DPEHPK3PXPJBSWY3DP" > totp_secret
chmod 644 ./*
touch done
