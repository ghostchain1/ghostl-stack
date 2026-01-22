# Build stage
FROM golang:1.22.5-alpine3.19 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -ldflags="-X github.com/ghostchain1/core-service/pkg/version.Version=0.1.0" -o core-service ./cmd/core-service

# Final stage
FROM alpine:3.19

RUN addgroup -S app && adduser -S app -G app \
  && apk --no-cache add ca-certificates \
  && mkdir -p /home/app

WORKDIR /home/app

COPY --from=builder /app/core-service /usr/local/bin/core-service

USER app

EXPOSE 8080

CMD ["core-service"]
