.PHONY: build run test clean tidy docker-build docker-run

# Build the application
build:
	go build -o bin/core-service ./cmd/core-service

# Run the application
run:
	go run ./cmd/core-service

# Run tests
test:
	go test -v ./...

# Clean build artifacts
clean:
	rm -rf bin/

# Tidy dependencies
tidy:
	go mod tidy

# Build Docker image
docker-build:
	docker build -t core-service:0.1.0 .

# Run Docker container
docker-run:
	docker run -p 8080:8080 core-service:0.1.0

# Install dependencies
deps:
	go mod download

# Format code
fmt:
	go fmt ./...

# Vet code
vet:
	go vet ./...

# Run all checks
check: fmt vet test

# Development setup
dev: tidy deps build
