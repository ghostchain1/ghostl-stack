FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libvirt-dev \
        pkg-config \
        gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 4070

ENV PYTHONUNBUFFERED=1 \
    GACK_PORT=4070 \
    GACK_MODE=dev

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4070"]
