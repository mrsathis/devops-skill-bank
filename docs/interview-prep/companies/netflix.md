---
tags:
  - interview
  - sre
---

# Netflix: DevOps Lead

## Round 1: Systems at scale, Kubernetes, cloud and Linux

**Implement fine-grained service discovery across 1000+ microservices using Envoy or Istio.**

- Istio's control plane (istiod) watches Kubernetes Services and Endpoints and pushes config to the Envoy sidecars (or ambient proxies) over xDS.
- At 1000+ services, limit what each proxy receives with **`Sidecar` resources** (only the services it calls). Otherwise every Envoy gets the whole mesh config and memory explodes.
- Use DestinationRules for subsets and versions, locality-aware load balancing, outlier detection, and multi-cluster service discovery (east-west gateways).
- Monitor xDS push latency and proxy memory.

**eBPF + Cilium for runtime network security: the advantages over traditional CNIs?**

Cilium enforces policy in **eBPF programs in the kernel**, based on workload *identity* (labels) rather than IP addresses, so it scales without huge iptables chains and copes with pod churn. It supports L7-aware policies (HTTP methods and paths, DNS names, Kafka topics), can replace kube-proxy, and provides deep visibility through Hubble (per-flow verdicts). Compared with iptables-based CNIs: lower latency and CPU at scale, faster policy updates, and richer observability. The trade-offs are a requirement for a newer kernel and operational complexity.

**Multi-cloud: your approach to cross-cloud routing, IAM and secret syncing.**

- **Routing**: private interconnects or VPN between clouds, global traffic management (DNS-based or anycast), service mesh federation for service-to-service traffic.
- **IAM**: one identity provider (SSO/OIDC) federated to each cloud, workload identity federation (for example a GCP workload assuming an AWS role through OIDC) instead of static keys.
- **Secrets**: a cloud-neutral source of truth (Vault) or replication to each cloud's secret manager through External Secrets.
- Keep the shared surface small: replicate only what has to cross clouds.

**What happens when systemd units fail intermittently on EKS nodes? How do you detect and heal?**

- **Detect**: node-problem-detector (custom plugins check `systemctl is-failed` for critical units such as kubelet and containerd) sets node conditions or events, and the journal is shipped to logs with alerts on unit failures.
- **Heal**: `Restart=on-failure` with sensible limits in the unit, and automatic node repair (EKS node auto repair, or a controller that cordons, drains and replaces nodes with bad conditions).
- Treat nodes as cattle: replace them, then root-cause the failing unit from the logs.

**App teams demand custom AMIs. Your pre-prod vetting strategy at kernel and runtime level?**

- Build only from an approved base through a **Packer pipeline**, with CIS hardening, no SSH keys baked in, and versioned images.
- Automated checks: kernel version and parameters, required modules, a containerd/kubelet compatibility matrix, CVE scan (Inspector), and boot-time tests (joins the cluster, passes conformance and smoke tests, GPU drivers if relevant).
- Canary node pool first, then promotion.
- Signed AMIs and an allowlist enforced by policy. → [Atlassian AMI checklist](atlassian.md)

**Advanced probe configuration to detect business logic failures, not just HTTP 200.**

Use a **readiness** endpoint that checks the service can actually do its job: critical dependencies reachable within timeouts, warm caches loaded, thread pools not saturated, and an internal self-test transaction. Return 503 with details when it can't. Keep **liveness** minimal (deadlock detection). Use a **startup** probe for warm-up. Better still, use synthetic transactions from outside and SLO-based alerting for business correctness, because probes only remove pods, they don't fix logic. → [Core: probes](../core-answers.md#probes)

**DNS-level outages inside a service mesh without redeploying the app.**

- Mesh-level fixes: Istio DNS proxying (the sidecar answers DNS for mesh services), ServiceEntries with static addresses for external dependencies, and retries or outlier detection in DestinationRules. All are applied as config, with no app redeploy.
- NodeLocal DNSCache to absorb CoreDNS issues, scaling CoreDNS.
- Fix `ndots` through pod `dnsConfig` in the next rollout.

**The Terraform remote-state backend suddenly times out. Recovery and containment.**

1. **Stop**: pause all pipelines that run Terraform so nobody retries into a half-locked or corrupt state.
2. **Check the backend**: S3, DynamoDB or the cloud API's status, IAM or VPC endpoint changes, network path from the runners.
3. **After recovery**: check for stuck locks (`force-unlock` only after confirming no run is active) and that the state version is consistent (compare with S3 version history), then run `plan` to confirm there's no unexpected drift.
4. **Containment**: smaller, split states so an issue affects one component, and backups of state.

## Round 2: RCA, fire drills and chaos

**A new Envoy config silently broke mTLS between the edge and the mesh. Your RCA trace.**

- Find where handshakes fail: Envoy stats (`ssl.handshake`, `ssl.connection_error`, `upstream_cx_connect_fail`), access log response flags (`UF`, `URX`), `istioctl proxy-config secret` and `cluster` on both sides.
- Diff the config change: PeerAuthentication mode (STRICT against PERMISSIVE), DestinationRule TLS mode (`ISTIO_MUTUAL` against `SIMPLE`), SAN or trust-domain mismatch, a certificate chain or root CA change, an SNI mismatch.
- Roll back the config and add a pre-deploy check plus a synthetic mTLS probe between the edge and the mesh.

**HPA refuses to scale even though Prometheus shows CPU > 80%.** → [Core: HPA](../core-answers.md#hpa). Prometheus and the HPA measure different things (request against limit or node). Also check the metrics pipeline lag, `maxReplicas`, and missing requests.

**You added a sidecar caching layer and tail latency spikes. Debug path?**

- The extra hop adds latency per request.
- Sidecar CPU limits cause **throttling** (check its own throttled periods).
- Cache misses go through a slower path (the sidecar's connection pool to the origin is too small).
- Cache stampedes on expiry, memory pressure and eviction, serialisation cost.

Compare p99 with the sidecar bypassed for a canary, and look at per-hop timing in traces.

**504s on the playback service. Load balancer healthy, mesh sidecars pass, but users can't stream. Triage.**

504 means the upstream answered too slowly. Health checks hit a cheap endpoint, but the real path does more. Find which hop's timeout fires (load balancer idle timeout against Envoy route timeout against the app's), and which dependency on the playback path is slow (licence/DRM service, manifest generation, a CDN steering service). Check for timeout misalignment after a config change, and test the real user journey with synthetics.

**NAT costs are surging with no infrastructure changes this week. What could silently trigger it?**

- A new or changed app behaviour: pulling container images or large artefacts through NAT, logs or metrics shipped to external SaaS, a retry storm against an external API, a dependency now calling a public endpoint for an AWS service (S3 without a gateway endpoint).
- Endpoint policy or route table changes so traffic falls back to NAT.
- Cross-AZ NAT routing.

Use VPC Flow Logs grouped by source and destination, and NAT gateway bytes metrics, to find the talker. → [Core: NAT gateway](../core-answers.md#nat-gateway)

## Round 3: Leadership, chaos culture and influence

**Build an engineering culture where SLOs are owned, not ignored.** Teams define their own SLOs with product, the SLOs drive real decisions (error-budget policy), they're reviewed in team rituals and planning, alerts are based on them, wins are celebrated, and leadership asks about SLOs and not just features.

**Ship multi-region failover in 3 weeks, with no DNS layer allowed. Your plan.** Use **anycast or global load balancing at layer 4**: AWS Global Accelerator (static anycast IPs with health-based failover across regions), or client-side failover (the app or SDK knows several regional endpoints and switches on errors). Data: make sure replication to the standby region is in place (or accept read-only mode in failover), pre-scale the standby, and run failover drills in weeks 2 and 3. Scope to critical user journeys first.

**Test infrastructure chaos and graceful degradation for a big Originals release.** In the weeks before: game days in production-like or production environments with a controlled blast radius (Chaos Monkey for instance kills, latency injection, region evacuation drills), verify fallbacks (personalisation falls back to a generic catalogue, and so on), load-test to the forecast peak, and prepare kill switches. During launch: freeze risky changes and have a war room ready.

**Prove the ROI of infrastructure modernisation to non-technical executives.** Translate it into business terms: revenue protected (fewer outage minutes × revenue per minute), engineering time freed (hours × cost), faster feature delivery (lead time), cost per stream. Show the baseline, the target, and early measured wins.
