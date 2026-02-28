FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bind9 bind9-utils dnsutils python3 python3-pip dumb-init ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/ghostdns/base-bind \
    && cp -a /etc/bind/. /opt/ghostdns/base-bind/

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip3 install --break-system-packages -r /app/requirements.txt

COPY src /app/src
COPY config /app/config
COPY entrypoint.sh /app/entrypoint.sh

RUN groupadd -g 10001 ghost \
    && useradd -u 10001 -g 10001 -m -s /usr/sbin/nologin ghost \
    && mkdir -p /etc/bind/zones /var/cache/bind /var/log/ghostdns /app/state/last_good \
    && chown -R ghost:ghost /etc/bind /var/cache/bind /var/log/ghostdns /app/state \
    && chmod +x /app/entrypoint.sh

EXPOSE 53/udp 53/tcp 8089

USER ghost:ghost

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/app/entrypoint.sh"]
