---
tags:
  - interview
  - sre
---

# LinkedIn: Senior Site Reliability Engineer

## Round 1: Systems and design

**Design a feed-serving system that handles hundreds of millions of members with low latency and graceful degradation.**

- **Read path**: edge/CDN → API gateway → feed service → precomputed feed cache (fan-out on write for most members, fan-out on read for very high-follower accounts) → ranking service → hydration (posts, profiles) from caches backed by distributed stores. Multi-region, active-active, with members pinned to a home region.
- **Latency**: everything hot sits in memory caches, calls run in parallel with strict timeouts, and each dependency has a latency budget.
- **Graceful degradation**: if ranking is slow, serve a chronological or cached feed. If hydration of a non-critical part (comments count) fails, drop that part. Use load shedding by priority and feature flags to turn off expensive features.
- **SLOs** on p99 latency and successful feed loads, and capacity headroom for regional failover (each region can absorb another's traffic).

**How would you design a Kafka-based event pipeline with ordering, replay and backpressure at massive scale?**

- **Ordering**: Kafka guarantees order only *within a partition*, so partition by the entity key (member ID) and use idempotent producers (`enable.idempotence=true`, `acks=all`).
- **Replay**: retention sized for your recovery window (or tiered storage). Consumers track offsets and can reset to a timestamp. Processing must be idempotent (dedupe keys, upserts) because delivery is at-least-once.
- **Backpressure**: consumers pull, so lag *is* the backpressure signal. Alert on lag (in time, not just messages), autoscale consumers up to the partition count, bound in-memory buffers, pause partitions when downstream is slow, and send poison messages to a dead-letter queue.
- **Scale**: plan partition counts up front (they're hard to change), use rack-aware replication factor 3 with `min.insync.replicas=2`, quotas per client, and MirrorMaker 2 or cluster linking across data centres.

**Design a deployment system that rolls out to thousands of services with automatic canary analysis.**

Pipeline per service → artefact registry → progressive delivery controller (Spinnaker/Kayenta, Argo Rollouts) → stages: canary (1%, compared statistically against a baseline cohort of the same size, *not* the whole fleet), then 10%, 50%, 100%, one region at a time. Health is judged on SLIs (errors, latency, saturation, plus business metrics). It rolls back automatically on failure. Add deploy freezes and error-budget gates, rate limits on concurrent rollouts per dependency tier, and an audit trail.

**How do you design service ownership, SLOs and error budgets across a large microservice estate?**

A service catalogue (Backstage) where every service has an owning team, on-call rotation, tier and dependencies. Each tier has required SLOs (availability and latency SLIs from load balancer or mesh metrics, standardised so they're comparable) and an error-budget policy agreed with product. Dashboards and burn-rate alerts are generated from SLO definitions as code (Sloth, OpenSLO). Make the SLO review part of quarterly planning. → [Core: SLOs](../core-answers.md#slo)

**How would you migrate a critical stateful service between data centres with no downtime?**

1. Replicate data to the target (database replication or CDC), and verify lag and consistency continuously.
2. Run the service in the target region in read-only or shadow mode, and compare responses.
3. Shift reads gradually.
4. Do a controlled **write cutover**: a short write fence or dual-write with conflict rules, promote the target to primary, and point writers at it.
5. Keep reverse replication running for rollback, and decommission the old site only after a soak period.

Rehearse it in staging, and choose a low-traffic window for the write switch.

## Round 2: RCA and troubleshooting

**Kafka consumer lag is growing but brokers look healthy. What do you check?**

The consumers and what's downstream of them:

- Processing time per record (slow DB writes or external calls).
- Consumer count against partition count (extra consumers sit idle).
- Frequent **rebalances** (`max.poll.interval.ms` exceeded because processing is slow, or pods restarting).
- A **hot partition** from a skewed key.
- GC pauses or CPU throttling.
- Commit failures.
- Retry loops on poison messages.

Look at lag per partition, the rebalance rate and processing latency. → [Kafka lag](../topics/sre-observability.md#kafka-lag)

**Latency rises for members in one geography only. How do you narrow it down?**

Slice the metrics by region, PoP, ASN and client type. Then check:

- **Edge and CDN**: a PoP or peering issue, BGP route changes.
- **DNS** steering members to a far region.
- The region's front door or load balancer.
- A dependency only that region calls.
- Capacity or a recent deploy in that region.

Use RUM data, synthetic probes from that geography, and traceroutes or MTR. Mitigate by steering traffic to a healthy region.

**A canary passed automated analysis but a customer-facing metric degraded later. What was missed?**

The canary didn't see the failure:

- Low canary traffic gave no statistical power.
- The metrics compared were technical, not business ones (conversion, feed engagement).
- The effect needed time (a memory leak, cache expiry, a batch job) or a specific cohort (one locale, one client version) that the canary didn't get.
- The canary was compared against a noisy baseline.

Fix: add business KPIs to the analysis, run longer bake times, use cohort-aware canaries, and monitor after rollout with automatic rollback.

**Datacenter drain is stuck at 80%. What do you investigate?**

What's still there and why it won't move:

- Stateful services or sticky sessions.
- Clients with hard-coded endpoints or long DNS TTLs and pinned connections (long-lived gRPC or WebSocket connections that never re-resolve).
- Capacity limits in the target that are throttling the shift.
- Services without multi-DC deployments.
- PDBs, or a drain tool waiting on unhealthy pods.

Look at the remaining traffic by caller and service and fix them one at a time (force reconnects, raise capacity).

## Round 3: Leadership and judgement

**How do you decide when to spend error budget and when to freeze releases?**

Follow the agreed error-budget policy, not a mood on the day. If budget remains, ship (including risky experiments). If the burn rate means we'll run out before the window ends, slow down: smaller changes, extra review. If it's exhausted, freeze non-critical changes until reliability fixes land, with exceptions for security and fixes. Budget spent by dependencies or planned maintenance is discussed openly.

**Tell me about a time you pushed back on a launch for reliability reasons.**

STAR: the risk you saw (no load test, no rollback path, a single point of failure), the data you brought, the alternative you offered (a staged launch, a feature flag, a dark launch), and the outcome (it launched a week later without an incident). Show you were trying to get it launched safely, not blocking it. → [Core: behavioural](../core-answers.md#behavioural)

**How do you run a post-incident review that leads to real systemic change?**

→ [Core: postmortems](../core-answers.md#postmortem). Key points: blameless, timeline built from data, contributing factors, specific owned actions with due dates, follow-up tracking in a weekly review, and look for themes across incidents.

**How do you balance on-call load so the team doesn't burn out?**

- Measure pages per shift and out-of-hours pages, with a target of roughly two incidents or fewer per shift.
- Cut noise with symptom-based alerts and runbooks.
- Follow-the-sun or a primary/secondary rotation, compensation and time off after a heavy shift.
- Fix toil and repeat incidents as priority work.
- Shared on-call ownership with the dev teams that ship the code.
- Review on-call health monthly.
