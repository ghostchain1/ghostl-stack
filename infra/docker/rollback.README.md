# Docker Snapshot Rollback

This restores Docker-related files from the latest snapshot under `infra/docker/_backup/YYYYMMDD-HHMM/`.

## Usage

```bash
./infra/docker/rollback.sh
```

The script:
- Detects the most recent backup folder.
- Restores only files listed in `MANIFEST.txt`.
- Prompts to run `docker compose down` after restore.

## Notes

- The rollback is file-based only; no volumes or data directories are modified.
- If you need a specific snapshot, set `BACKUP_DIR` in the script before running.
