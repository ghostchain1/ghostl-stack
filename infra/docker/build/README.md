# ARM64 Image Notes

This directory contains plan-only guidance for multi-arch image builds.

## Goals

- Preserve existing behavior.
- Prefer multi-arch images when available.
- Avoid changing images for running chain services unless low risk.

## Buildx

Use `buildx.sh` to print safe build commands for local images.
