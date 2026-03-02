FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvirt-clients \
    curl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY supervisor.py ./

EXPOSE 9108
CMD ["python", "-u", "/app/supervisor.py"]
