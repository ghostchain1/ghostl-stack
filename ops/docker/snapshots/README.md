# Snapshots

Snapshot folders are created by `ghostctl-recreate.sh` and contain:
- Docker inventory (ps/images/volumes/networks)
- Rendered compose config
- Env files
- Chain data fingerprints (pre/post)
- Gas token report
- Restore plan

Do not edit snapshots manually. Use rollback script to restore from a snapshot.
