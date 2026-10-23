FROM debian:trixie-slim
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    openssh-server openssh-client libpam-google-authenticator python3 socat putty-tools oathtool ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/sshd /srv/www \
 && echo "hello from termix" > /srv/www/hello.txt
COPY gen.sh entry.sh algos.json /opt/termix/
RUN chmod +x /opt/termix/*.sh
ENTRYPOINT ["/opt/termix/entry.sh"]
