---
tags:
  - interview
  - sre
---

# Tesla: DevOps Engineer and SRE/DevOps

Two saved posts: a DevOps Engineer loop, and an SRE/DevOps loop.

## DevOps Engineer: Round 1 (systems reliability, edge and observability)

**A service depends on Kafka + Redis. Both look healthy but requests fail intermittently. What's your debug path before escalating to app teams?**

"Healthy" usually means the server-side dashboards look fine. Check from the **client's** side:

- Client-side errors and timeouts in traces and logs.
- Connection pool exhaustion.
- Redis latency spikes from slow commands (`SLOWLOG`, `KEYS`, big values), `maxclients`, or failovers changing the primary.
- Kafka producer timeouts or retries, `NOT_LEADER` errors during partition leadership changes, consumer rebalances.
- Network: DNS resolution, conntrack, security group or NetworkPolicy changes, TLS cert rotation.
- Whether the failures line up with a specific pod, node or AZ.

Only then hand it to the app team, with evidence.

**Design a secure CI/CD pipeline that pushes code to both cloud and on-prem edge environments.**

- **Single pipeline**: build once, scan, sign (cosign), produce an SBOM, push to a central registry and mirror it to edge registries.
- **Delivery**: pull-based **GitOps** at the edge (Argo CD or Flux agents in each edge cluster pull desired state), because edge sites have intermittent connectivity and shouldn't accept inbound connections.
- **Security**: OIDC or short-lived credentials, signature verification at admission (Kyverno), mTLS, per-site identities.
- **Rollout**: rings (lab, then canary sites, then regions), health gates, automatic rollback, and offline-tolerant agents.

**How would you debug a pod stuck in ContainerCreating? Your next 3 CLI commands?**

1. `kubectl describe pod <pod>` and read the Events.
2. `kubectl get events -n <ns> --sort-by=.lastTimestamp`.
3. On the node: `journalctl -u kubelet` or `crictl ps -a`.

Common causes: CNI failure or no IP addresses left, a volume attach or mount error (EBS in another AZ, a multi-attach error, a missing Secret or ConfigMap to mount), an image pull still in progress, or a runtime error.

**Gradual latency increase across an NGINX ingress, but CPU and memory are stable. Next move?**

- Look at upstream response time against request time in the ingress logs (`$upstream_response_time`) to tell whether the ingress or the backends are slow.
- Check connection reuse (keep-alive to upstreams), worker connection limits, conntrack table usage, and backend latency through traces.
- Check whether config reloads are increasing (frequent endpoint changes cause NGINX reloads), and DNS resolution for `ExternalName` upstreams.

→ [Core: latency with normal resources](../core-answers.md#latency-normal-resources)

## DevOps Engineer: Round 2 (incident simulation and RCA)

**Firmware build pipeline fails during artefact uploads. S3 shows no error and Jenkins logs are incomplete. Where do you start?**

- Get the full error. Raise the log level, check agent logs (the agent may have died: OOM or disk full, which also truncates logs) and the Jenkins controller logs.
- Test the upload path from the agent itself (`aws s3 cp` with `--debug`): credentials expiring mid-upload for large multipart uploads, proxy or VPC endpoint policy denies, KMS permissions, upload timeouts, or the network dropping long connections.
- Check S3 server access logs or CloudTrail data events for the request, and the agent's disk space.

**A Cilium update broke inter-pod communication for one namespace. How do you confirm the root cause?**

- **Scope**: only that namespace, so suspect policy. Check `CiliumNetworkPolicy` and `NetworkPolicy` selecting it. Policy semantics or default-deny behaviour can change between versions.
- **Use Hubble**: `hubble observe --namespace X --verdict DROPPED` shows the drop reason (policy denied, identity issue).
- Run `cilium status`, `cilium-dbg endpoint list` (or `cilium endpoint list` on older versions), and check that identities were regenerated. Look at the agent logs.
- Compare against the release notes, test in staging, and roll back the Cilium version or adjust the policy.

**30% of Superchargers in Europe report "backend unavailable", but cloud dashboards are green. Isolate DNS, TLS or routing drift.**

The dashboards measure the server side, so measure from the client side. Group the failing chargers by country, carrier (cellular APN), firmware version and backend endpoint. Then test each layer from an affected network path:

- **DNS**: what the chargers resolve, TTLs, geo-DNS answers, a resolver at the carrier.
- **TLS**: an expired or rotated certificate or intermediate, a CA bundle on old firmware that doesn't trust the new chain, SNI, the clock on the devices.
- **Routing**: BGP or anycast changes, a carrier peering issue, a firewall or allowlist change, MTU.

Synthetic probes from the same carriers find the layer quickly.

## DevOps Engineer: Round 3 (leadership)

**How would you define SLOs that make sense across manufacturing, energy and vehicle telemetry?**

One *framework*, different SLIs per domain, all based on the user journey:

- **Manufacturing**: line-control API availability and latency, with tight targets and maintenance windows.
- **Energy**: command success (charge started) and telemetry freshness.
- **Vehicle**: remote command success within N seconds, and OTA delivery success.

Tier services by impact, set error budgets per tier, and report them in one consistent format.

**When engineers ship daily, how do you enforce release confidence without slowing innovation?**

Automate the confidence instead of adding gates: fast CI with good tests, feature flags, canary releases with automated analysis, error-budget policies, and instant rollback. Use manual approval only for high-risk changes such as database migrations or safety systems.

**Introducing chaos testing for edge clusters: how do you scope risk boundaries?**

Start in staging and a lab cluster, define the steady-state hypothesis and abort conditions, start with the smallest blast radius (one pod, one node, one site in off-hours), never touch safety-critical paths, get the site owners' agreement, and widen scope gradually with game days and automated stop conditions.

**How do you mentor DevOps engineers to think systemically, not syntactically?**

Have them explain *why* the system behaves as it does, not just which command to run. Pair on incidents, run postmortem walkthroughs, use "break it and fix it" labs, have them write design docs with trade-offs, rotate them through on-call with a shadow, and review their reasoning, not just the YAML.

## SRE/DevOps: Round 1 (Kubernetes, GitOps, cloud and platform)

**Design a highly available Kubernetes platform that supports millions of connected vehicles.**

- **Clusters**: several clusters per region (cells) across 3 AZs, so the blast radius is one cell. Control plane managed (EKS) or HA, etcd backed up.
- **Ingress**: device traffic over MQTT/WebSockets or gRPC through NLBs with mTLS, with stateless connection-handling services that scale horizontally on connection count.
- **Messaging**: Kafka or Kinesis for telemetry, with partitioning by vehicle ID.
- **State**: managed databases (DynamoDB, Cassandra) replicated across regions.
- Autoscaling (HPA on custom metrics, Karpenter), GitOps, an observability stack, and regional failover with vehicles reconnecting to another region.

**Explain your GitOps workflow. How do you deploy infrastructure and apps safely with Argo CD or Flux?**

- CI builds and pushes an immutable image, then opens a PR that bumps the tag in the environment's config repo.
- After review and merge, Argo CD syncs the cluster (app-of-apps or ApplicationSets per cluster and environment), with sync waves and health checks, and Argo Rollouts for canaries.
- Infrastructure goes through Terraform pipelines (or Crossplane or the Terraform controller) with plan review.
- Promotion is a Git PR from dev to stage to prod. Rollback is a `git revert`. Drift is auto-healed. Secrets come from External Secrets.

**Design a Kubernetes Operator for tasks like certificate rotation or application lifecycle.**

Define a CRD (for example `ManagedCertificate` with a spec for domains and an issuer, and a status for expiry and conditions). Write a controller with controller-runtime or Kubebuilder that **reconciles** idempotently: it watches the CR and the Secrets it owns, requests or renews certificates before expiry (requeue at the renewal time), writes a Secret, triggers a rolling restart through a hash annotation, and updates the status conditions. Add owner references for garbage collection, finalisers for cleanup, leader election, back-off on errors, RBAC least privilege, and metrics. (In practice, cert-manager already does this. Say so.)

**Securing a hybrid-cloud Kubernetes environment (AWS + on-prem).**

- **Identity**: SSO/OIDC for humans and workload identity (IRSA, SPIFFE/SPIRE) everywhere.
- **Network**: private connectivity (Direct Connect or VPN), segmentation, default-deny NetworkPolicies, mTLS mesh across clusters.
- **Policy**: Kyverno or Gatekeeper with the same rule set everywhere.
- **Supply chain**: a central signed registry mirrored on-prem, with signature verification.
- **Secrets**: Vault.
- Unified audit logging and runtime detection, and consistent patching. → [Core: Kubernetes security](../core-answers.md#k8s-security)

**How do you prevent Terraform state drift across multiple environments?** → [Core: drift](../core-answers.md#tf-drift). Applies only from CI, read-only console access, scheduled drift plans, policy as code, and the same module versions promoted through environments.

**Capacity planning for a rapidly growing SaaS platform.**

Forecast from business drivers (users, devices, events per device) and turn them into resource needs with load tests (requests per second per pod, events per broker). Keep N+1 or regional failover headroom, track utilisation and saturation trends, autoscale for daily cycles, buy commitments for the baseline, and review quarterly. Use lead times for anything slow to get (quotas, reserved capacity, hardware on-prem).

**Automate provisioning with Terraform, Kubernetes and Ansible.**

Terraform for cloud and infrastructure (networks, clusters, databases), Ansible for OS configuration of VMs and bare metal (or bake images with Packer instead), and Kubernetes manifests or Helm through GitOps for workloads. Wire them through pipelines: Terraform outputs feed Ansible inventories and cluster bootstrap (Argo CD installed by Terraform, then it manages the rest).

**Migrating legacy services to cloud-native microservices with minimal downtime.**

The **strangler fig** pattern: put a routing layer (API gateway or proxy) in front of the monolith, carve out one capability at a time, route that path to the new service, sync data with CDC during the transition, run in shadow and compare, then cut over per route with a feature flag. Roll back by switching the route back.

## SRE/DevOps: Round 2 (incident response and debugging)

**Users suddenly can't unlock their vehicles through the mobile app. Investigate and mitigate.**

1. **Declare an incident** and scope it: all users or some, a region, an app version, iOS or Android.
2. **Follow the command path**: app → API gateway/auth → command service → messaging to the vehicle (connection service) → vehicle acknowledgement. Use traces and metrics at each hop to find where success drops.
3. **Check recent changes**: deploys, certificates (expired mTLS or token signing keys are classic), auth provider status, push-notification or messaging backlog.
4. **Mitigate**: roll back, fail over the region, scale the queue consumers. Communicate the workaround (the key card).
5. **Postmortem.**

**Kubernetes nodes are healthy but API latency suddenly doubles.** → [Core: latency with normal resources](../core-answers.md#latency-normal-resources). Use traces to find the slow span, then check dependencies, connection pools, CPU throttling, DNS and recent deploys.

**An OTA rollout fails for a subset of vehicles. Infrastructure, network or application?**

Group the failures by vehicle model, firmware version, region, carrier, CDN PoP and download stage (manifest fetch, download, signature check, install). If it's one region or carrier, it's the network or CDN. If it's one hardware or firmware cohort, it's the application or package. If every vehicle fails at the download stage, check CDN or origin errors and signed-URL expiry. Pause the rollout ring while you investigate.

**Prometheus shows elevated error rates but dashboards don't reveal the root cause.** Break the error metric down by label (route, status code, pod, version, AZ), then pivot to traces of failed requests and to logs by trace ID. Check change events (deploys, config, feature flags) and dependencies' error rates.

**Terraform partially fails, leaving infrastructure inconsistent.** → [Core: partial apply](../core-answers.md#tf-partial-apply)

**Pods continuously restart after a deployment, but readiness probes remain healthy.**

Readiness doesn't restart pods, so look at what does:

- The **liveness** probe (a different endpoint, too-tight timeout, or slow start without a startup probe).
- **OOMKilled** (exit 137).
- The app exiting by itself (exit code, `--previous` logs).
- A sidecar crashing.
- Node eviction.

`kubectl describe pod` shows the last state and reason. → [Core: CrashLoopBackOff](../core-answers.md#crashloopbackoff)

**Postmortem after an outage affecting millions of vehicles.** → [Core: postmortems](../core-answers.md#postmortem). Also include customer communication, a safety review, and regulatory reporting if needed.

**Describe a production incident you handled and the lessons you implemented.** Use STAR. → [Core: behavioural](../core-answers.md#behavioural)

## SRE/DevOps: Round 3 (system design and leadership)

**Design the backend for remote unlock, climate control and vehicle location.**

- Mobile app → API gateway (OAuth tokens, rate limits) → command service, which validates ownership and authorisation and writes the command with an ID, TTL and idempotency key.
- Vehicles hold a persistent, mTLS-authenticated connection (MQTT/WebSocket) to a connection gateway. A routing table (Redis) maps vehicle to gateway node, and the command is pushed through it. If the vehicle is asleep, a wake-up goes over SMS or cellular.
- The vehicle acknowledges, and status updates go back to the app through push or a WebSocket. Location and telemetry stream into Kafka, with the latest state in a key-value store.
- Commands are signed end to end, with audit logs, multi-region deployment and SLOs on command success latency.

**Design a globally distributed platform for secure OTA software updates to millions of vehicles.**

- Packages are built, signed (with keys in an HSM), and their manifests signed too. Use the Uptane/TUF framework for compromise resilience.
- Distribution goes through a CDN with short-lived signed URLs, and supports deltas.
- A rollout service controls waves by cohort, monitors install success, and halts automatically.
- Vehicles verify signatures before installing and keep an A/B partition for rollback.
- Telemetry feeds the dashboards, and a backlog of offline vehicles is handled as they reconnect.

**Highly available platform for driver preferences across multiple vehicles.**

Profile service with a multi-region store (DynamoDB global tables or Cassandra), last-writer-wins or per-field versioning for conflicts, a cache at the edge, and sync to the vehicle when it connects (the vehicle caches a local copy for offline use). Use idempotent updates with version numbers.

**Monitoring platform for the fleet network with actionable alerts and no alert fatigue.** OpenTelemetry collection, metrics in Prometheus/Mimir or managed equivalents, logs in Loki or OpenSearch, traces in Tempo. SLO-based burn-rate alerts, routing by ownership, runbooks, and aggregated fleet-level alerts (not one per vehicle). → [Core: alerting](../core-answers.md#alerting)

**Multi-region failover with minimal customer impact.** Active-active or warm standby by service tier, data replication with known lag, health-based routing (Route 53/ARC, or Global Accelerator), clients that retry against another region, capacity headroom, and regular failover drills. → [Core: DR](../core-answers.md#dr-strategies)

**Scaling a platform processing millions of telemetry events per second.**

Partitioned ingestion (Kafka or Kinesis) with many partitions keyed by vehicle, stateless consumers autoscaled on lag, stream processing (Flink) for aggregates, hot and cold storage tiers (a time-series database for recent data, S3 or Parquet for history). Use batching, compression, sampling of high-frequency signals, and backpressure.

**Tell me about influencing an architectural decision.** and **How do you balance velocity with reliability, security and operational excellence?** Use STAR. The balance comes from error budgets, paved-road platforms with security built in, and automation instead of manual gates. → [Core: behavioural](../core-answers.md#behavioural)
