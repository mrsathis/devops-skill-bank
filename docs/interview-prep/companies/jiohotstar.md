---
tags:
  - interview
  - sre
---

# JioHotstar: Senior DevOps Engineer

## Round 1: Streaming at scale, Kubernetes, cloud and Linux

**Design autoscaling for 50M+ concurrent viewers across multiple clusters without over-provisioning.**

- Most video bytes come from **CDNs**, not your clusters. Scale the CDN (multi-CDN, pre-positioned content) and keep the origin and API tier lean.
- The API tier (auth, playback manifest, entitlement) scales on **concurrency and request-rate metrics** (KEDA or a custom-metrics HPA), not CPU alone.
- Use **predictive or scheduled scaling** from the event calendar (matches start at known times) to pre-scale before the toss and the first ball, then let reactive scaling handle the variance.
- Multiple clusters as cells behind global load balancing, Karpenter for fast node provisioning, Spot for stateless tiers with an on-demand floor.
- Prepare degradation levers: lower default bitrate, turn off non-essential features (recommendations, comments).

**During an IPL final, a new region must spin up instantly. Pre-warm nodes and scale workloads with no cold-start impact.**

- Keep the region's **infrastructure already built** with IaC and GitOps (clusters, networking, images replicated to the regional registry), scaled down to a warm minimum.
- Before the event: scale node pools ahead of time (raise minimums, or use low-priority **placeholder pods** that get pre-empted so real pods schedule instantly onto warm nodes), pre-pull images (a DaemonSet or images baked into the AMI), warm caches and connection pools, and pre-warm load balancers (AWS can do this on request).
- Raise service quotas in advance, and verify with a load test against the new region.

**Envoy + Istio to route low-latency live streams differently from VOD, without service restarts.**

Istio VirtualService routes on headers, path or SNI (for example `/live/*` or `x-stream-type: live`) to a dedicated subset or service tuned for live: smaller buffers, shorter timeouts, no retries on stale segments, priority node pools. VOD can use more caching-friendly settings. Routing rules change at runtime through xDS, so no restarts are needed. Add a DestinationRule per subset with its own connection-pool and outlier settings.

**Multi-zone pod affinity and anti-affinity so a node failure doesn't hurt regional streaming SLAs.**

Use **topologySpreadConstraints** with `topologyKey: topology.kubernetes.io/zone` and `kubernetes.io/hostname`, `maxSkew: 1`, `whenUnsatisfiable: DoNotSchedule` for critical services. Add soft pod anti-affinity on hostname, PDBs, enough replicas that losing one zone still leaves capacity (N+1 zones), and zonal node pools so each AZ can scale independently.

**Monitor HPA scaling decisions in real time and detect if the metrics server is lagging.**

- Watch HPA status metrics from kube-state-metrics (`kube_horizontalpodautoscaler_status_desired_replicas` against current, and conditions such as `ScalingLimited` or `AbleToScale`) and HPA events.
- Check metrics freshness (the metrics-server scrape timestamp, and the age of the custom metrics adapter's data).
- Alert when desired replicas haven't changed while load rises, when the HPA shows `<unknown>`, or when metric age goes over a threshold.

## Round 2: RCA, fire drills and streaming chaos

**Playback failures spike for only 3% of users in APAC. CPU, memory and pods look fine. Triage plan.**

Segment the failing 3%: device and OS, app version, ISP/ASN, CDN and PoP, DRM type, content ID, network type. Common causes:

- One CDN PoP or ISP peering issue.
- A DRM licence-server issue for one device family.
- A specific app version's bug.
- A geo-IP misclassification blocking entitlement.
- Certificate chain problems on old devices.

Use client-side error codes (RUM/QoE data), not server health. Mitigate by steering that segment to another CDN.

**Kafka ingestion lags 2 minutes during a surge. Producers are fine, consumers are idle.**

Idle consumers plus lag means **consumers aren't receiving or allowed to process work**:

- A rebalance storm (consumers repeatedly joining and leaving because of a too-short `max.poll.interval.ms` or session timeout, or pods restarting).
- Fewer partitions than consumers, or a **hot partition** handled by one consumer while the rest sit idle.
- Consumers paused because a downstream sink is applying backpressure, or blocked on a lock or slow external call (idle CPU, waiting on I/O).
- `fetch.min.bytes`/`fetch.max.wait.ms` settings, or consumer quotas throttling them.

Check per-partition lag and the consumer group state (`kafka-consumer-groups --describe`). → [Kafka lag](../topics/sre-observability.md#kafka-lag)

**Sudden tail latency on a Redis-based session store during a match. Find and fix the bottleneck.**

- `SLOWLOG GET`, `INFO commandstats`, and latency monitoring (`LATENCY DOCTOR`).
- Look for **hot keys** (`redis-cli --hotkeys` needs an LFU eviction policy), big keys, blocking commands (`KEYS`, big `HGETALL`), fork latency from RDB/AOF persistence during snapshots, CPU saturation of the single-threaded main loop, network saturation, and client connection storms.
- Fix: shard hot keys, avoid blocking commands, read replicas, move persistence to replicas, scale out the cluster, and set client timeouts and pooling.

**HPA refuses to scale a critical pod set even though Prometheus shows CPU > 90%.** → [Core: HPA](../core-answers.md#hpa)

## Round 3: Leadership and reliability culture

**Build a culture where latency SLOs are enforced like uptime SLAs.** Make latency (time to first frame, rebuffer ratio) the headline SLI, put it on executive dashboards next to revenue impact, attach error-budget policies to it, and include it in release gates and postmortems.

**Ship multi-region failover for live events in 2 weeks with no DNS-based routing allowed.** → [Netflix answer](netflix.md): Global Accelerator or anycast, client-side multi-endpoint failover (the player app has a list of regional endpoints), pre-replicated data, and drills.

**Simulate chaos in a streaming pipeline without risking real user impact.** Use shadow or mirrored traffic into a parallel pipeline, chaos in staging with production-like load (replay), production experiments limited to tiny cohorts (internal users, one low-traffic region) with automatic abort on QoE SLI degradation, and never during live events.
