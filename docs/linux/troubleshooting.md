---
tags:
  - linux
  - runbook
---

# Linux troubleshooting: the first 60 seconds

Run these in order on a slow or misbehaving host before digging deeper.

```bash
uptime                      # load averages: rising or falling?
dmesg -T | tail -20         # OOM killer, disk or network errors
vmstat 1 5                  # r = run queue, si/so = swapping, wa = IO wait
mpstat -P ALL 1 3           # one CPU pegged?
pidstat 1 3                 # which processes use CPU
iostat -xz 1 3              # disk util and await
free -h                     # memory and swap
sar -n DEV 1 3              # network throughput
ss -s                       # socket summary
top                         # overall view
```

`mpstat`, `pidstat`, `iostat` and `sar` come from the `sysstat` package.

## Common findings

| Symptom | Check | Typical fix |
|---|---|---|
| Disk full | `df -h`, `du -xh / --max-depth=1 \| sort -h` | Rotate/clean logs, grow the volume |
| Disk "full" but `du` disagrees | `lsof +L1` | Restart the process holding deleted files |
| Out of inodes | `df -i` | Remove many small files (cache/session dirs) |
| Process killed randomly | `dmesg -T \| grep -i oom` | Raise memory or fix the leak |
| Service won't start | `systemctl status <svc>`, `journalctl -u <svc> -n 100` | Fix config, permissions or port clash |
| Port already in use | `ss -ltnp \| grep :<port>` | Stop the other process or change port |
