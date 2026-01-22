# Final Validation

- No compose files were applied to running containers.
- Runtime snapshot captured in `infra/docker/runtime/` represents the pre-change state.
- Unified compose files are generated for future use only.

## Notes

- Use `infra/docker/tests/smoke.sh` to validate live runtime when needed.
- Use `infra/docker/tests/compose-diff.sh` to verify chain services are unchanged.
