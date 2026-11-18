---
tags:
  - interview
  - sre
  - linux
---

# Nvidia: Senior DevOps Engineer (GPU infrastructure) and SRE

Two saved posts: a senior DevOps loop for GPU infrastructure (heavy on Linux and bare metal), and an SRE loop.

## Senior DevOps (GPU infra): Round 1 (Linux, hardware and the GPU stack)

**A node boots but never joins the cluster. From power-on, walk through what you check, in order.**

1. **BMC/IPMI**: power state, hardware event log (SEL), and a console-redirect view of POST.
2. **Firmware/BIOS**: POST completes, boot order, PXE enabled on the right NIC.
3. **PXE**: DHCP lease handed out (check DHCP server logs for the MAC), TFTP or HTTP boot file fetched.
4. **Bootloader**: GRUB loads the right kernel and command line.
5. **initramfs**: drivers for storage and NIC present, root filesystem found (watch for a dracut emergency shell).
6. **OS up**: network configured (link, VLAN, bond, IP, DNS), time synced (TLS fails on clock skew), cloud-init or provisioning finished.
7. **kubelet**: running, the bootstrap token or certificate is valid, it can reach the API server (firewall, load balancer), the container runtime is up, node name is unique, and CSR approval happens. Read `journalctl -u kubelet`.

**GPU passthrough intermittently drops under load. Confirm whether it's the driver, the IOMMU groups, or the workload's memory pinning, without rebooting.**

- **Driver/hardware**: `dmesg` and `journalctl -k` for NVIDIA **Xid** errors (Xid 79 "fallen off the bus" points to PCIe or power, others to the driver or app). Use `nvidia-smi -q` for ECC errors, retired pages, temperature and power, and `nvidia-smi dmon` while under load.
- **IOMMU**: check `/sys/kernel/iommu_groups/*` (the GPU should be in its own group or with its audio function only), `dmesg | grep -i -e DMAR -e IOMMU` for faults, and ACS settings.
- **Memory pinning**: check hugepages and locked memory (`ulimit -l`, the VM's memlock), NUMA placement, and whether faults line up with allocation peaks.
- Line these up against the timing of the drops, and use DCGM diagnostics (`dcgmi diag -r 1`, a non-disruptive level).

**Disk pressure alerts on a node that `df -h` shows at 40%. What's filling it, and how do you prove it?**

- `df -i` for **inodes**. The kubelet also evicts on inode pressure.
- The kubelet watches **nodefs and imagefs**: `/var/lib/kubelet` and `/var/lib/containerd` may be separate filesystems from `/`. Run `df -h` on those mounts.
- **Deleted but still-open files**: `lsof +L1`.
- Container writable layers, `emptyDir` and logs: `crictl stats`, `du` on the pod directories.

Prove it by matching the kubelet's eviction signal (from `kubectl describe node`) to the filesystem it refers to. → [Core: disk full](../core-answers.md#disk-full)

**A server hangs at POST after a BIOS update. You're remote with IPMI. Recovery sequence before you call it an RMA?**

1. Check the SEL and POST codes over IPMI, and power cycle (`ipmitool chassis power cycle`).
2. Clear CMOS / reset BIOS to defaults through the BMC, if supported.
3. Boot from the **backup BIOS image** (dual-BIOS boards) or re-flash the BIOS through the BMC's firmware update function, with the previous known-good version.
4. Reseat or isolate hardware remotely where possible (turn off PCIe slots in BIOS settings).
5. Update the BMC itself if the versions are incompatible.

If none of that works, RMA it, and in the postmortem change how firmware is rolled out: canary nodes and staged rollout.

**Explain NUMA topology, how the kernel schedules across it, and what breaks in a GPU training job when you ignore it.**

On multi-socket servers, each CPU socket has local memory and PCIe devices. Access to the remote socket's memory or devices crosses the interconnect (UPI or Infinity Fabric), which is slower. The kernel tries to keep tasks and memory on the same node (automatic NUMA balancing) but can migrate them.

For GPU training, if the data-loader threads and pinned host buffers sit on the socket far from the GPU and NIC, host-to-device copies and GPUDirect RDMA cross the interconnect. Throughput drops and becomes inconsistent across ranks, so collective operations wait for the slowest one.

Fix it by pinning processes per GPU to the local NUMA node (`numactl`, `nvidia-smi topo -m`, Kubernetes Topology Manager with `single-numa-node`, CPU Manager `static`).

**A NIC reports 40G in `iftop`, the switch shows 4G. Where's the gap?**

`iftop` measures what the host *sees* (possibly including offloaded or aggregated traffic), and the switch counts what physically passed that port. Check:

- The **negotiated link speed** (`ethtool eth0`, which could be 10G or 1G) and which physical port the switch stat refers to.
- **Bonding/LACP**: traffic spread over other links.
- Units (bits against bytes is a factor of 8: 40 Gbit/s against 5 GB/s).
- Sampling intervals, VLANs or sub-interfaces counted twice, traffic between virtual interfaces on the same host (VMs or containers) that never touches the wire, or TSO/GRO making counters look inflated.

Use `ethtool -S` counters against the switch interface counters over the same interval.

## Round 2: Infrastructure as code and automation

**Terraform shows drift on 12 resources after a manual console change. Reconcile without taking a service down.** → [Core: drift](../core-answers.md#tf-drift). Read every diff, update the code for intended changes, use `ignore_changes` where another system owns the value, never apply anything marked "forces replacement" without a plan, and apply in small batches with `create_before_destroy` where needed.

**Ansible passes `--check` but fails on the real run. The first three causes, and how to isolate them.**

1. **Tasks that check mode can't evaluate**: `command`/`shell` are skipped in check mode, so later tasks that depend on their results or registered variables behave differently.
2. **Dependencies created earlier in the run**: a package or service a later task needs doesn't exist yet in check mode (installing a package, then templating its config directory).
3. **Environment and privilege**: `become` or sudo, credentials, network access or disk space that's only tested on a real run.

Isolate with `-vvv`, `--diff`, `--start-at-task`, run against one host, and use `check_mode: no` on harmless lookup tasks.

**200 nodes need a kernel patch by Friday. Rollout plan.**

- **Rings**: a lab node, then a canary ring of 5 non-critical nodes, then 10%, 25% and the rest, respecting AZ, rack and failure domains.
- **Per node**: cordon, drain (PDBs respected), patch, reboot, health check (kernel version, GPU driver loads, `nvidia-smi`, DCGM quick diagnostics, network), then uncordon.
- **Automation**: Ansible serial batches or a node-maintenance operator.
- **Rollback criteria**: boot failure, Xid errors, a performance regression on a benchmark job. Keep the previous kernel as the GRUB fallback.
- Communicate the schedule to job owners and pause between rings.

**The Jenkins pipeline is green but the shipped artefact is broken. What guardrails do you add?**

- Test the **artefact itself**, not the source: start the built image or binary and run smoke and integration tests against it.
- Check checksums and signatures, and use immutable versioned artefacts.
- Compare against a production-like environment (same base image and drivers), use contract tests, and canary deploy with automatic rollback.
- Record provenance (SLSA) so you know exactly what was built from what.

**Ansible module vs role: when does each become a liability?**

A **module** is a unit of work (`apt`, `template`). Custom modules become a liability when they reimplement what existing modules do, or when they hide non-idempotent logic. A **role** packages tasks, handlers, templates and defaults for reuse. Roles become a liability when they grow into giant "do everything" roles with lots of conditionals, deep variable precedence surprises, and no versioning or tests (Molecule). Keep roles small, versioned and tested.

## Round 3: Containers and production incidents

**Pod stuck in ImagePullBackOff: walk the rabbit hole.** → [Core: ImagePullBackOff](../core-answers.md#imagepullbackoff). Registry authentication, NetworkPolicy or egress firewall to the registry, wrong image digest or platform, and node disk pressure preventing layer extraction.

**Node goes NotReady mid-training. Kubelet says "evicted due to disk pressure" but `df` shows 30%.**

Same as above: it's **imagefs, nodefs or inodes**, not `/`. Large container images (CUDA images are many GB), checkpoints or datasets written to `emptyDir` or the container layer, and logs. Fix it with a dedicated volume for checkpoints, image GC thresholds, bigger or separate disks for containerd, and `ephemeral-storage` requests and limits on pods.

**CI passes, but the canary is OOMKilled within 90 seconds. What changed?**

Compare the canary against the old version: dependency or runtime upgrades (a new JVM or base image changing memory defaults), config (cache sizes, thread counts, batch size), and production data volume that CI never loads. Look at the memory growth curve to tell a fast leak from a fixed allocation at startup. Prove it with a heap profile or by running the new image with production-like data in an isolated namespace. → [Core: OOMKilled](../core-answers.md#oomkilled)

**Liveness vs readiness, with a real failure.**

Example: the liveness probe hit `/health`, which checked the database. During a 30-second database failover, every pod failed liveness and was **restarted at the same moment**. Cold starts and a reconnect storm turned a 30-second blip into a 10-minute outage. Fix: liveness checks only the process, readiness reflects dependencies, so pods leave the load balancer briefly but aren't killed. → [Core: probes](../core-answers.md#probes)

**A rolling update stalls at 60% and never finishes. What do you check before hitting undo?**

`kubectl rollout status` and `kubectl describe deploy` for conditions (`ProgressDeadlineExceeded`). Then look at the new pods:

- Pending: no capacity, quota, affinity.
- Not Ready: readiness failing on the new version.
- CrashLooping.
- Image pull issues.
- A PDB or `maxUnavailable: 0` with no surge capacity.

Read the new ReplicaSet's events. The old pods are still serving, so you have time to find out why before undoing.

## Round 4: Judgement and architecture

**"Automate everything by Q4." Half the runbooks are tribal knowledge. Your first 30 days?**

1. **Discover**: shadow on-call, interview the engineers who hold the knowledge, list every manual task with its frequency, time and risk.
2. **Document**: turn tribal knowledge into runbooks as you learn it (each runbook is the spec for its own automation).
3. **Prioritise**: by frequency × time × risk. Automate the top 5 first, safely and idempotently, with dry-run modes.
4. **Quick wins and metrics**: hours saved, incidents avoided.
5. Push back on "everything": some rare, risky tasks are better documented than automated.

**A senior engineer wants one giant monorepo Jenkins pipeline. Push back: what's the real cost?**

- Every change builds and tests everything, so builds are slow.
- One flaky test blocks every team, and there's one large blast radius.
- It's hard to own and change, and there's contention on agents.
- Coupled release cadence across teams.

Propose a monorepo with **affected-only builds** (path-based triggers, or Bazel or Nx) and per-service pipeline definitions generated from a shared library, so you get the consistency without the coupling.

**A misconfigured Ansible run detaches a production mount at noon on a weekday. Write the postmortem.**

- **Summary**: impact (which services, users, duration), detection (alert or user report), resolution (remount, restart services).
- **Timeline** from data.
- **Root cause**: for example, a variable precedence issue made a `mount` task with `state: absent` apply to prod hosts, and it was run in business hours without check or diff mode, without a limit flag, and without review.
- **Contributing factors**: no peer review of playbook changes, no staged rollout (`serial`), no guardrails such as an assertion that refuses to unmount data volumes.
- **Actions**: PR review plus a `--check --diff` pipeline, `serial` with `max_fail_percentage`, `--limit` enforced, change windows for production, inventory separation, and monitoring that pages on missing mounts.

Blameless throughout. → [Core: postmortems](../core-answers.md#postmortem)

---

## SRE loop

**What are DNS, HTTP and HTTPS? Ports for SSH, NFS, SFTP and FTP.** DNS 53, HTTP 80, HTTPS 443, SSH 22, NFS 2049, SFTP 22 (over SSH), FTP 21 (control; 20 for active-mode data). → [Core: OSI and ports](../core-answers.md#osi)

**How are packets transferred from one point to another (internet and intranet)?**

The application data is wrapped in TCP or UDP, then IP, then an Ethernet frame. On the local network, ARP resolves the next hop's MAC address and switches forward by MAC. To reach other networks, packets go to the default gateway (router), which forwards by IP routing tables hop by hop (with BGP between ISPs on the internet). NAT rewrites addresses at the edge. Each hop re-frames the packet for its link. On the way back, the reply follows the reverse path, and TCP handles reliability and ordering.

**Wi-Fi enablement and device connectivity; how routers and DHCP work.**

The device associates with an access point (SSID, WPA2/WPA3 authentication), then runs **DHCP**: DISCOVER (broadcast) → OFFER → REQUEST → ACK, which gives it an IP address, subnet mask, default gateway, DNS servers and a lease time. The router forwards traffic between networks using its routing table, and usually does NAT and acts as the DHCP server on home and small networks.

**Linux networking commands; open and block IPs.** `ip a`, `ip route`, `ss -tulpn`, `nmcli connection modify eth0 ipv4.addresses …`, `firewall-cmd --add-port=443/tcp --permanent`, `iptables -I INPUT -s x.x.x.x -j DROP`, `tcpdump`, `dig`, `traceroute`/`mtr`, `curl -v`. → [Core: block IP](../core-answers.md#block-ip)

**Server sizing for Jenkins controller and agents, SonarQube, Docker, Kubernetes, Prometheus and Grafana.** There's no single right answer, so explain the drivers:

- **Jenkins controller**: moderate CPU and RAM (for example 4 vCPU / 8–16 GB), sized by jobs and plugins, with no builds running on it. **Agents** are sized by the build (8–16 GB for Java builds, ephemeral and autoscaled).
- **SonarQube**: 4 vCPU / 8–16 GB plus a separate database.
- **Prometheus**: memory grows with **active series** (roughly a few KB per series), and disk with retention. Grafana is lightweight.

Size from measured load and revisit it.

**Securing databases; DR for the database and for Jenkins.** Databases: private subnets, security groups restricted to the app tier, encryption at rest and in transit, IAM or managed credentials with rotation, least-privilege database users, audit logs, automated backups plus PITR, and cross-region copies. Jenkins: `JENKINS_HOME` backed up (or Configuration as Code plus jobs defined in Git so the controller is rebuildable), agents ephemeral, controller restorable from code. → [Core: DR](../core-answers.md#dr-strategies)

**Monitoring and logging for EKS.** Control-plane logs to CloudWatch (API, audit, authenticator, controller manager, scheduler). Container Insights or Prometheus (Amazon Managed Prometheus) with Grafana, kube-state-metrics and node_exporter. Logs through Fluent Bit to CloudWatch or OpenSearch. Traces through ADOT/OpenTelemetry to X-Ray.

**How does EKS handle updates and patches for the control plane and worker nodes?** AWS manages and patches the control plane, but *you* start minor-version upgrades. Worker nodes are your responsibility: managed node groups roll new AMIs when you trigger an update, Karpenter replaces drifted nodes, and Fargate is patched by AWS. Add-ons (VPC CNI, CoreDNS, kube-proxy) are updated separately. → [Core: cluster upgrade](../core-answers.md#cluster-upgrade)

**Worker nodes in EKS: how are they provisioned?** Managed node groups (an ASG with EKS-optimised or Bottlerocket AMIs, managed lifecycle), self-managed ASGs, Karpenter (launches instances directly), or Fargate (serverless, one pod per micro-VM). Nodes join using the cluster endpoint and the IAM node role mapped through access entries (previously the `aws-auth` ConfigMap).

**Optimising performance on EKS and multi-region considerations.** Right-size requests and limits, HPA plus Karpenter, topology spread, the VPC CNI prefix delegation for pod density, keeping traffic in the same AZ, caching, and Graviton. Multi-region: a cluster per region managed through GitOps, global routing (Route 53 latency or failover, Global Accelerator), replicated data stores, images replicated with ECR replication, and per-region capacity headroom.

**Helm release vs Helm chart; how do you deploy a chart?** → [Core: Helm](../core-answers.md#helm)

**System design: a deployment architecture for a Docker microservices app, with HA and scalability.** Containers on an orchestrator (EKS or ECS) across 3 AZs, an ALB or ingress in front, stateless services with HPA, managed data stores with Multi-AZ, a registry with scanning, CI/CD with canary releases, a service mesh or service discovery, centralised observability, and secrets from a vault. → [Core: HA on AWS](../core-answers.md#aws-ha)

**A difficult customer interaction; seeing a bigger opportunity and convincing your team.** Use STAR: listen, acknowledge, reset expectations with data, follow through. For the bigger opportunity, quantify it and pilot it before asking for buy-in. → [Core: behavioural](../core-answers.md#behavioural)
