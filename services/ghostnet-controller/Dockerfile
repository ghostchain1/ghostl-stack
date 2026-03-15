FROM python:3.12-slim

# Install libvirt system libs for optional libvirt-python binding
RUN apt-get update && apt-get install -y --no-install-recommends \
        libvirt-dev \
        pkg-config \
        gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 4060

ENV PYTHONUNBUFFERED=1 \
    GNMC_PORT=4060 \
    GNMC_MODE=dev

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4060"]
