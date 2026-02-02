FROM ghcr.io/blockscout/frontend:latest
USER root
RUN if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache bash curl; \
    elif command -v apt-get >/dev/null 2>&1; then \
      apt-get update \
        && apt-get install -y --no-install-recommends bash curl \
        && rm -rf /var/lib/apt/lists/*; \
    else \
      echo "No supported package manager found." >&2; \
      exit 1; \
    fi
USER nextjs
