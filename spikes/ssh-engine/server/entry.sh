#!/bin/sh
set -eu
keys=/out
role=${ROLE:-target}
if [ "$role" = target ]; then /opt/termix/gen.sh "$keys"; else while [ ! -f "$keys/done" ]; do sleep 0.5; done; fi

mkuser() {
  id "$1" >/dev/null 2>&1 || useradd -m -s /bin/bash "$1"
  echo "$1:termix-pass" | chpasswd
  install -d -m 700 -o "$1" -g "$1" "/home/$1/.ssh"
  install -m 600 -o "$1" -g "$1" "$keys/authorized_keys" "/home/$1/.ssh/authorized_keys"
}
for u in pw key kbd cert kp; do mkuser "$u"; done
rm -f /home/cert/.ssh/authorized_keys

# kbd: password round, then a TOTP round
printf '%s\n" TOTP_AUTH\n' "$(cat $keys/totp_secret)" > /home/kbd/.google_authenticator
chown kbd:kbd /home/kbd/.google_authenticator && chmod 400 /home/kbd/.google_authenticator
cat > /etc/pam.d/sshd <<PAM
auth required pam_unix.so
auth required pam_google_authenticator.so nullok
account include common-account
session include common-session
PAM

for t in ed25519 ecdsa rsa; do install -m 600 "$keys/host_$t" "/etc/ssh/ssh_host_${t}_key"; cp "$keys/host_$t.pub" "/etc/ssh/ssh_host_${t}_key.pub"; done
cp "$keys/host_ed25519-cert.pub" /etc/ssh/ssh_host_ed25519_key-cert.pub
cp "$keys/ca.pub" /etc/ssh/ca.pub

cat > /etc/ssh/sshd_config <<CONF
Port 22
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_rsa_key
HostCertificate /etc/ssh/ssh_host_ed25519_key-cert.pub
TrustedUserCAKeys /etc/ssh/ca.pub
UsePAM yes
PasswordAuthentication yes
KbdInteractiveAuthentication yes
PubkeyAuthentication yes
AllowTcpForwarding yes
PermitTunnel no
MaxStartups 200
MaxSessions 50
ClientAliveInterval 0
Subsystem sftp internal-sftp
Match User pw
  AuthenticationMethods password
Match User key
  AuthenticationMethods publickey
Match User kbd
  AuthenticationMethods keyboard-interactive
Match User cert
  AuthenticationMethods publickey
Match User kp
  AuthenticationMethods publickey,password
CONF
if [ "$role" = target ]; then
  if [ ! -f /data/big.bin ]; then
    mkdir -p /data
    head -c "${BIG_MB:-500}M" /dev/urandom > /data/big.bin
    sha256sum /data/big.bin | cut -d' ' -f1 > /data/big.sha256
  fi
  chmod 755 /data && chmod 644 /data/*
  socat TCP-LISTEN:7000,fork,reuseaddr EXEC:cat &
  (cd /srv/www && python3 -m http.server 8080 >/dev/null 2>&1) &
fi

if [ "$role" = algos ]; then
  python3 - <<'PY'
import json, subprocess
for e in json.load(open("/opt/termix/algos.json")):
    args = ["/usr/sbin/sshd", "-f", "/etc/ssh/sshd_config", "-p", str(e["port"])]
    for k, v in e["sshd"].items():
        args += ["-o", f"{k}={v}"]
    ok = subprocess.run(args[:1] + ["-t"] + args[1:], capture_output=True).returncode == 0
    if ok:
        subprocess.Popen(args)
    print(("on " if ok else "server-unsupported ") + e["id"], flush=True)
PY
  touch /run/algos-ready
  exec sleep infinity
fi

exec /usr/sbin/sshd -D -e
