---
tags:
  - interview
  - linux
---

# Linux, networking, scripting and database questions (company not named)

## Linux scenarios

**A sudden CPU spike: find the root cause.** → [Core](../core-answers.md#high-cpu)

**A critical application is unresponsive.** Is the process alive (`systemctl status`, `ps`)? Is it hung (state `D` means uninterruptible I/O wait, which points at storage or NFS)? Use `top -H` for busy threads, `strace -p <pid>` to see what it's blocked on, `ss -tnp` (connections piling up in CLOSE_WAIT or a full backlog), logs, resources (memory, file descriptors, disk full). Collect diagnostics (thread or heap dump, `gcore`) **before** restarting, then restart, then root-cause.

**Zero-downtime deployment of a web app on Linux servers.** Several servers behind a load balancer. For each server in turn: drain or deregister it from the load balancer → deploy (symlink-swap release directories, or containers) → health check → re-register. Or blue-green with two server pools. With a single server: start the new version on another port and switch the NGINX upstream with `nginx -s reload` (graceful).

**A teammate deleted important files: recover them.** First **stop writing to that filesystem** (remount read-only if possible) to avoid overwriting blocks. Best option: **restore from backups or snapshots** (EBS snapshot, LVM snapshot, backup tool). If a process still has the file open: `ls -l /proc/<pid>/fd` → `cp /proc/<pid>/fd/<n> /restore/file`. Last resort: `extundelete` or `ext4magic` (ext4), `photorec` or `testdisk`. XFS recovery is much harder. Prevention: backups, snapshots, restricted permissions, `rm` safeguards, and version control for config.

**Running out of disk space: short and long term.** → [Core](../core-answers.md#disk-full)

**Set up a basic firewall.** `firewalld`: `firewall-cmd --permanent --add-service={ssh,https}` then `--reload`, default zone drop or public. `ufw`: `ufw default deny incoming; ufw allow 22/tcp; ufw allow 443/tcp; ufw enable`. Or `nftables`/`iptables` rules: allow established connections, allow needed ports, drop the rest. Restrict SSH to admin CIDRs, and review rules regularly.

**Set up Git version control on a Linux server.** A bare repo (`git init --bare /srv/git/app.git`) with SSH access for users (keys in `authorized_keys` of a `git` user, or Gitea/GitLab for a UI and permissions), developers clone, branch and push, hooks for CI triggers, plus backups. In practice, use a hosted platform (GitHub or GitLab).

**Monitor Linux performance over time.** `sar` (sysstat history), `vmstat`, `iostat`, `mpstat`, `pidstat`, plus node_exporter → Prometheus → Grafana with alerts, or the CloudWatch agent. Keep baselines to compare against.

**Secure a Linux server.** Patch regularly (automatic security updates), minimal packages and services, a firewall, **SSH hardening** (keys only, no root login, `AllowUsers`, MFA or SSM instead of open 22), least privilege with sudo rules, SELinux or AppArmor enforcing, auditd and centralised logs, fail2ban, file-integrity monitoring (AIDE), CIS benchmark hardening, disk encryption, and time sync.

**Production server slow: identify CPU, memory, disk or network issues; a process using high CPU; a service running but not listening on the expected port.**

The 60-second checklist (`uptime; dmesg -T | tail; vmstat 1; mpstat -P ALL 1; pidstat 1; iostat -xz 1; free -h; sar -n DEV 1; sar -n TCP,ETCP 1; top`). → [Core](../core-answers.md#high-cpu)

Service running but not listening: `ss -ltnp | grep <port>` (listening on another port, or only on 127.0.0.1 or ::1?), check its config and logs for bind errors (`Address already in use` means another process holds the port: `ss -ltnp 'sport = :8080'`), permission to bind ports below 1024 (needs root or `CAP_NET_BIND_SERVICE`), SELinux port labels (`semanage port -l`), or the service still starting.

**What are inodes? RAID configurations?** Inodes → [Core](../core-answers.md#inodes-fds). RAID: **0** (striping: speed, no redundancy), **1** (mirroring), **5** (striping with single parity, survives one disk failure, slow writes), **6** (double parity, two disk failures), **10** (mirrored stripes: performance plus redundancy, 50% capacity). Software RAID is `mdadm`. In the cloud you rarely use RAID: EBS is already replicated within its AZ, and RAID 0 over EBS is only for throughput.

**Explain how Linux starts (boot).** → [Core](../core-answers.md#linux-boot)

**Exit codes.** `0` is success, non-zero is failure. Conventions: `1` general error, `2` misuse of a shell builtin, `126` not executable, `127` command not found, `128+N` killed by signal N (`130` = Ctrl-C/SIGINT, `137` = SIGKILL/OOM, `143` = SIGTERM). Check with `echo $?`, and use `set -e`/`pipefail` in scripts.

**Add users in Linux; set a password for a user on a Compute Engine VM.** `useradd -m -s /bin/bash alice && passwd alice`, `usermod -aG wheel alice` (sudo on RHEL) or `sudo` (Debian), keys in `~alice/.ssh/authorized_keys` (700/600 permissions). On **GCE**, prefer **OS Login** (IAM-managed users and SSH keys) or project/instance SSH keys in metadata. To set a password: SSH in and `sudo passwd <user>` (password authentication over SSH is disabled by default, which is fine). For Windows VMs: `gcloud compute reset-windows-password`.

**What is `ssh-keygen` and why use it?** It generates SSH **key pairs** (`ssh-keygen -t ed25519 -C "me@laptop"`): a private key (kept secret, optionally passphrase-protected) and a public key (`.pub`) placed in the server's `~/.ssh/authorized_keys`. Key-based authentication is stronger than passwords and can be automated. It's also used for host keys, fingerprints (`-l`) and signing certificates (SSH CA).

**Set up Apache on Linux; convert HTTP to HTTPS.** `dnf install httpd` (or `apt install apache2`), `systemctl enable --now httpd`, open the firewall port, put content in `/var/www/html` and vhosts in `/etc/httpd/conf.d/`. HTTPS: get a certificate (**certbot** `certbot --apache -d example.com` with Let's Encrypt, or a CA certificate), enable `mod_ssl` with a `<VirtualHost *:443>` using `SSLCertificateFile`/`SSLCertificateKeyFile`, redirect port 80 to 443 (`Redirect permanent / https://example.com/`), turn on HSTS and modern TLS settings, and automate renewal.

**Access a service from any directory; where system services are stored.** Put the binary or script in a directory on `$PATH` (`/usr/local/bin`) or add its directory to `PATH` in `~/.bashrc` or `/etc/profile.d/*.sh`. **systemd unit files**: package units in `/usr/lib/systemd/system/` (or `/lib/systemd/system/`), **your custom or override units in `/etc/systemd/system/`** (which takes precedence), with `systemctl daemon-reload` after changes and `systemctl edit <unit>` for drop-in overrides.

**Cron job vs running it under sudo; cron security.** Cron schedules commands as the owning user (user crontab `crontab -e`, or `/etc/crontab` and `/etc/cron.d/` with a user field). `sudo` just runs one command with elevated privileges right now. A job that needs root belongs in root's crontab or `/etc/cron.d` rather than calling `sudo` inside a user cron (which needs NOPASSWD rules). **Security**: restrict with `/etc/cron.allow`/`cron.deny`, scripts owned by root and not writable by others (otherwise privilege escalation), absolute paths (cron's `PATH` is minimal), no secrets in crontabs, log output, least privilege (run as a service user). Consider **systemd timers** instead (logging, dependencies, sandboxing).

**Commands to open and block IPs.** → [Core](../core-answers.md#block-ip)

**Ten Linux commands; basic Bash commands; daily Linux tools.** → [HashedIn](../companies/hashedin-deloitte.md)

**Linux folder structure (FHS).** `/bin`, `/sbin` (essential binaries, now symlinks into `/usr`), `/etc` (config), `/var` (variable data: logs, spool, caches, `/var/lib` for app state), `/home`, `/root`, `/tmp` (temporary, often tmpfs), `/usr` (user-space programs and libraries, `/usr/local` for locally installed software), `/opt` (add-on packages), `/boot` (kernel, initramfs, GRUB), `/dev` (device files), `/proc` and `/sys` (kernel and process virtual filesystems), `/mnt` and `/media` (mounts), `/run` (runtime data, tmpfs).

## Scripting

**Shell vs Bash.** "Shell" is the general command interpreter (sh, bash, zsh, dash, ksh, fish). **Bash** is one specific shell (GNU Bourne-Again Shell) with extras over POSIX `sh`: arrays, `[[ ]]`, `$(( ))`, brace expansion, `set -o pipefail`. Scripts starting `#!/bin/sh` should be POSIX-portable, and `#!/usr/bin/env bash` for Bash features.

**What is a shebang?** The first line `#!` + interpreter path (`#!/usr/bin/env python3`) telling the kernel which interpreter to run the script with when it's executed directly (`./script`).

**`$*` vs `$@` in Bash.** Both expand to all positional arguments. Unquoted, they behave the same (word-split). **Quoted**: `"$@"` expands to each argument as a **separate word** (preserving spaces inside arguments, which is almost always what you want), while `"$*"` joins them into **one string** separated by the first character of `IFS`.

**Bash script for prime numbers.**

```bash
#!/usr/bin/env bash
# usage: ./primes.sh 50   -> prints primes up to 50
n=${1:?usage: $0 <limit>}
for ((i=2; i<=n; i++)); do
  is_prime=1
  for ((j=2; j*j<=i; j++)); do
    (( i % j == 0 )) && { is_prime=0; break; }
  done
  (( is_prime )) && printf '%d ' "$i"
done
echo
```

**Factorial script.** → [Accenture](../companies/accenture.md)

**Do you have PowerShell or shell scripting experience?** Give real examples: Bash for automation (log rotation, health checks, deployments), PowerShell for Windows and Azure (`Az` module) tasks. Mention error handling, idempotency and testing (ShellCheck, Pester).

## Networking

**OSI vs TCP/IP; which is better to implement?** → [Core](../core-answers.md#osi). You don't "implement" OSI. Real networks use **TCP/IP**. OSI is a reference model for teaching and for describing where a problem sits.

**TCP vs UDP; ports for DNS, SSH, HTTPS.** → [Core](../core-answers.md#osi)

**What is CIDR?** Classless Inter-Domain Routing: IP ranges written as `address/prefix-length`. `10.0.0.0/16` = 65,536 addresses (first 16 bits fixed), `/24` = 256, `/32` = one host. It replaced classful A/B/C networks. AWS reserves 5 IPs in every subnet.

**How many bytes in IPv4 and IPv6?** IPv4 = **32 bits = 4 bytes**. IPv6 = **128 bits = 16 bytes**.

**Logical vs physical address; MAC vs IP.** A **MAC address** (physical, layer 2) is 48 bits, burned into or assigned to a network interface, and used for delivery **within a local network segment**. An **IP address** (logical, layer 3) is assigned by configuration or DHCP, hierarchical and routable, and used for delivery **across networks**. ARP (IPv4) or NDP (IPv6) maps IP to MAC on the local link. MACs are rewritten at each hop. IPs stay end to end (except NAT).

**What is a network gateway?** The device (usually a router) that connects a local network to other networks. Hosts send traffic for non-local destinations to their **default gateway**. In cloud terms: an internet gateway, NAT gateway, VPN gateway, transit gateway.

**Network endpoint group (GCP).** A GCP load-balancing backend that groups **endpoints** (IP:port pairs) instead of whole VM instance groups: **zonal NEGs** (VM IPs or GKE pod IPs for container-native load balancing), **serverless NEGs** (Cloud Run, App Engine, Functions), **internet NEGs** (external backends), and hybrid NEGs (on-prem). They let load balancers target pods directly.

**Different types of load balancers.** → [Core](../core-answers.md#alb-nlb-cloudfront). Also by scope (global vs regional, internal vs external), algorithm (round robin, least connections, hash), and software (NGINX, HAProxy, Envoy) vs hardware (F5).

**Horizontal vs vertical scaling.** **Vertical** (scale up): a bigger machine. It's simple but has an upper limit, often needs a restart, and remains a single point of failure. **Horizontal** (scale out): more machines behind a load balancer. It's near-limitless and resilient, but needs stateless design and distributed coordination. Cloud-native systems prefer horizontal scaling.

**HTTP/1.1 vs HTTP/2 vs HTTP/3.** **HTTP/1.1**: text protocol, one request at a time per connection (head-of-line blocking), so browsers open about 6 connections per host, with keep-alive. **HTTP/2**: binary framing, **multiplexed streams** over one TCP connection, header compression (HPACK), server push (now deprecated). It still suffers TCP-level head-of-line blocking on packet loss. **HTTP/3**: runs over **QUIC (UDP)**: per-stream loss recovery (no TCP head-of-line blocking), faster handshakes (TLS 1.3 built in, 0-RTT resumption), and connection migration across networks (Wi-Fi to cellular).

**Process vs thread.** → [Core: processes](../core-answers.md#linux-processes). A process has its own address space and resources. Threads share their process's memory and file descriptors. Threads are cheaper to create and switch, but a bug in one can corrupt the others.

**Troubleshooting network latency.** Measure where it's spent: `mtr`/`traceroute` (per-hop latency and loss), `ping` for RTT, `curl -w '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer}\n'` (DNS, TCP, TLS, server time), `ss -ti` (RTT and retransmits per connection), `tcpdump`/Wireshark for retransmissions and window issues, MTU or fragmentation problems (`ping -M do -s 1472`), and cross-AZ or cross-region paths.

**Packet flow; DHCP; routers; Wi-Fi.** → [Nvidia SRE](../companies/nvidia.md)

## Databases and SQL

**Primary key vs foreign key.** A **primary key** uniquely identifies each row in a table (unique, not null, one per table). A **foreign key** is a column in one table that references the primary (or unique) key of another, enforcing **referential integrity** (you can't reference a non-existent parent, with cascading options on delete or update).

**HAVING vs WHERE.** `WHERE` filters **rows before** grouping and aggregation (it can't use aggregate functions). `HAVING` filters **groups after** `GROUP BY` (it can use aggregates: `HAVING COUNT(*) > 5`).

**Types of JOINs.** `INNER JOIN` (only matching rows in both), `LEFT [OUTER] JOIN` (all left rows plus matches, NULLs where none), `RIGHT JOIN` (the mirror), `FULL OUTER JOIN` (all rows from both), `CROSS JOIN` (Cartesian product), plus self-joins.

**DROP vs TRUNCATE vs DELETE.** `DELETE` removes rows matching an optional `WHERE`. It's logged per row, fires triggers, can be rolled back, and keeps the table. `TRUNCATE` removes **all** rows quickly (deallocates pages, minimal logging), resets identity counters in many engines, no `WHERE`, doesn't fire row triggers, and its transactional behaviour varies (it's rollback-able in PostgreSQL and SQL Server, but an implicit commit in MySQL and Oracle). `DROP` removes the **table itself** (structure, data, indexes and permissions).

**MySQL vs MongoDB; relational databases; primary key.** → [HashedIn](../companies/hashedin-deloitte.md)

**Do you know MySQL / have you worked on databases?** Be honest about your depth: installs and configuration, users and grants, backups (mysqldump, xtrabackup, RDS snapshots), replication, slow query log and `EXPLAIN`, indexes, connection limits, and monitoring.
