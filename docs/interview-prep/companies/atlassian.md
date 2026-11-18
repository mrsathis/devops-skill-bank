---
tags:
  - interview
  - kubernetes
---

# Atlassian: DevOps Architect

## Round 1: Infrastructure, Kubernetes and cloud patterns

**Design a multi-tenant EKS cluster with isolation across dev, QA and prod, with no noisy neighbours.**

The honest architect answer: **don't put prod in the same cluster as dev and QA**. Use separate clusters (ideally separate accounts) for prod. For dev and QA sharing a cluster:

- A namespace per environment or team, ResourceQuotas and LimitRanges, required requests and limits.
- Dedicated node pools per environment through taints and tolerations (and Karpenter NodePools), PriorityClasses.
- Default-deny NetworkPolicies, RBAC per namespace, separate IRSA roles.
- Policy enforcement (Kyverno), and cost allocation per namespace.

**Manage 10+ Kustomize overlays without drift or duplication.**

- A small, solid **base**, plus **components** for optional features shared across overlays. Overlays contain only real differences (replicas, resources, config), using strategic merge or JSON patches.
- Generate overlays with Argo CD ApplicationSets (cluster or list generators) instead of copy-paste.
- CI checks: `kustomize build` every overlay, validate with kubeconform, diff against the live cluster, and lint for forbidden patterns.
- Version the base and promote by changing the reference.

**Secure cross-region S3 replication and validate data integrity at scale.**

- **Security**: replication IAM role with least privilege, SSE-KMS with **multi-region keys** or a KMS key in the destination, Block Public Access, Object Lock on the destination for immutability, a separate destination account (protection against account compromise), and TLS-only bucket policies.
- **Integrity**: Replication Time Control (RTC) with replication metrics and events, alerts on `FAILED` replication status, S3 Inventory reports compared between source and destination (keys, sizes, checksums, with additional checksums such as SHA-256), and S3 Batch Replication for backfill and retries.

**What happens when systemd hits a failing unit on a containerised node? How do you auto-recover?** systemd applies the unit's `Restart=` policy within `StartLimitBurst`/`StartLimitIntervalSec`, after which the unit stays failed. If it's kubelet or containerd, the node goes NotReady. Auto-recover: sensible restart policies, node-problem-detector to surface the condition, and automatic node replacement (EKS node auto repair or a remediation controller). → [Netflix answer](netflix.md)

**Detect and mitigate pod-to-pod lateral movement inside a cluster.**

- **Prevent**: default-deny NetworkPolicies with explicit allows, mTLS with authorisation policies (a mesh), least-privilege service accounts (no token automount where not needed), Pod Security restricted, no secrets in env vars.
- **Detect**: Cilium Hubble or flow logs for unexpected connections, Falco or GuardDuty runtime monitoring (shells in containers, unusual processes, API server access from pods), API audit logs for service account misuse.
- **Respond**: isolate the pod with a quarantine NetworkPolicy, capture forensics, rotate credentials.

**Zero-downtime upgrades for a stateful workload using Helm 3.** → [Uber stateful answer](uber.md). Use StatefulSet `RollingUpdate` with `partition` to upgrade one replica at a time (or `OnDelete`), PDBs, readiness gates checking replication, `helm upgrade --atomic --wait --timeout`, a backup before the upgrade, and `helm rollback` if it fails. Be careful with immutable fields (volumeClaimTemplates can't be changed in place).

**A hybrid cloud routing architecture between GCP and AWS. Where do you enforce boundaries?** Connect over HA VPN or partner interconnect (Cross-Cloud Interconnect or a co-location exchange) into transit hubs (AWS Transit Gateway, GCP NCC/Cloud Router), with BGP route exchange of only the needed prefixes and non-overlapping CIDRs. Enforce boundaries at the hubs (route filtering), with firewalls or inspection VPCs, security groups and firewall rules, and at the application layer (mTLS and identity-based authorisation). Zero-trust: never trust traffic just because it came from the "private" link.

**Terraform state got corrupted during a backend migration. Rebuild strategy?** Stop all runs. Restore the last good version from the old backend or S3 versioning, verify with `terraform plan` (expect no changes), then redo the migration carefully (`terraform init -migrate-state` with locking, after backing up). If there's no good copy, rebuild with import blocks per resource, component by component. → [Core: lost state](../core-answers.md#tf-state-lost)

**Bash one-liner: find all running containers using more than 500 MB RSS on a node.**

```bash
# Docker hosts
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | awk '{split($2,a,"/"); v=a[1]; if (v ~ /GiB/) {sub(/GiB/,"",v); v*=1024} else {sub(/MiB/,"",v)}; if (v+0 > 500) print $1, v" MiB"}'

# Any node (containerd/Kubernetes): RSS of container processes from /proc
for p in $(pgrep -f containerd-shim); do for c in $(pgrep -P $p); do rss=$(awk '/VmRSS/{print $2}' /proc/$c/status); [ "${rss:-0}" -gt 512000 ] && echo "$c $(cat /proc/$c/comm) $((rss/1024)) MiB"; done; done
```

On Kubernetes, `kubectl top pods -A --sort-by=memory` is simpler, though it reports the working set, not RSS.

## Round 2: Real fire, RCA and chaos

**A new ALB config makes TLS handshakes fail intermittently. Full RCA path.** Intermittent suggests something that differs between connections: the **TLS security policy** changed (dropping ciphers or protocols old clients use), a certificate on only some listeners or SNI hosts, an incomplete chain, mTLS trust-store settings, or a client-specific issue (old Java or Android). Check ALB metrics (`ClientTLSNegotiationErrorCount`), access logs (`ssl_protocol`, `ssl_cipher`, `-` for failed ones), test with `openssl s_client -servername` across protocol versions, and roll back the policy.

**Nodes are healthy but `kubectl logs` is blank for critical pods. What's happening?**

- The app logs to a **file** rather than stdout/stderr, or log level or buffering (Python `-u`, a stdout buffer).
- The container was restarted, so use `--previous`.
- The log file was rotated and lost (kubelet rotation with `containerLogMaxSize`), or the node's log directory is full or on a broken mount.
- For multi-container pods, use `-c <container>`.
- The kubelet API isn't reachable from the API server (`kubectl logs` goes through the kubelet on port 10250, so blocked or timing-out connections can surface as errors or empty output).

**You deployed a sidecar logging agent and CPU throttling spikes. Diagnose and roll back.** The agent's CPU limit is too low for the log volume (it gets throttled and possibly slows the app through shared node resources), or it parses expensive regexes or multiline logs. Check `container_cpu_cfs_throttled_periods_total` per container. Roll back the injection (remove the label or annotation and restart), then right-size it or switch to a node-level DaemonSet agent instead of per-pod sidecars.

**Autoscaling doesn't kick in despite CPU crossing the threshold. Metrics, HPA, or API server?** Check them in order: `kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/<ns>/pods` (metrics available?) → `kubectl describe hpa` (conditions, `<unknown>`, events) → controller-manager logs (the HPA controller runs there) and API server health. → [Core: HPA](../core-answers.md#hpa)

**Prod users report 504s, but ELB health checks are green. Isolation and triage.** → [Netflix 504 answer](netflix.md): health checks are shallow, the real path is slow. Line up timeouts across layers and find the slow dependency.

**Systemd journal logs vanish on reboot on some AMIs. What do you check in the image build and boot sequence?** The journal is **volatile** when `/var/log/journal` doesn't exist and `Storage=auto` (the default writes to `/run/log/journal`, which is tmpfs). Check `journald.conf` (`Storage=persistent`), whether the image build deleted `/var/log/journal` (cleanup scripts), whether `/var/log` is a separate mount that fails or mounts late, and size limits (`SystemMaxUse`). Fix it in the Packer build and test persistence across a reboot in the image pipeline.

**A production pod was OOMKilled, but you can't find logs. Forensic-level debug.**

- `kubectl describe pod` and events for the OOMKilled reason and time.
- Node `dmesg`/`journalctl -k` for the **kernel OOM killer report** (memory cgroup stats and the process list at the time of the kill).
- Metrics history (`container_memory_working_set_bytes`, RSS against cache).
- The `--previous` container logs if they're still on the node.
- Centralised logs from before the kill.
- Enable heap dumps on OOM for the runtime (JVM `-XX:+HeapDumpOnOutOfMemoryError` to a persistent volume), or memory profiling.

→ [Core: OOMKilled](../core-answers.md#oomkilled)

**Kernel panic on a GKE node mid-deploy. Infrastructure, base image or app?** Get the panic output (serial console logs in Cloud Logging, kdump if enabled). Look for patterns: only nodes with a specific node image or kernel version (infrastructure or base image), only nodes running a particular workload (a privileged app or driver, eBPF, or kernel-module loading is the classic app-level trigger), or a hardware or machine-type pattern. Compare against GKE release notes and known issues. Mitigate by cordoning and draining affected nodes and pinning or rolling back the node image.

## Round 3: Leadership and production principles

**Design infrastructure that empowers developers without giving them footguns.** Golden-path templates and self-service with safe defaults, guardrails enforced by policy (not by docs), progressive delivery built in, quotas and budgets, read access everywhere but write through pipelines, and sandboxes for experiments.

**Your Linux-level checklist before approving a custom AMI to production.**

- Built from an approved base by a pipeline (no manual changes), with a versioned, signed provenance.
- Kernel version and parameters (sysctl), required modules, cgroup v2, time sync.
- CIS hardening score, no default passwords or SSH keys, IMDSv2 required.
- CVE scan clean (critical and high), minimal packages.
- Log persistence and agents (SSM, CloudWatch or OTel) installed.
- containerd, kubelet and CNI versions compatible.
- Boots and joins a test cluster, passes conformance and smoke tests, performance baseline.
- Rollback plan (the previous AMI).

**Moving from centralised logging to a service-mesh-based observability model: the trade-offs.** The mesh gives you uniform L7 metrics, traces and access logs for every service without code changes (golden signals out of the box). But it **doesn't replace application logs** (business context, errors inside the app). It adds overhead per hop (CPU, memory, latency), cardinality and cost, mesh operational complexity, and only covers traffic that goes through the mesh. Best practice: use both. Mesh telemetry for traffic, app logs and OTel traces for internals, correlated by trace ID.
