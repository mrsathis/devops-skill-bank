---
tags:
  - interview
  - sre
---

# Uber: Senior DevOps Engineer

## Round 1: Real-time systems, multi-region and platform reliability

**Design multi-region failover for a dispatch and matching system that can't tolerate duplicate ride assignments.**

The key is that **only one region can own a ride or trip at a time**.

- Partition ownership by geography (city or cell). Each cell has exactly one active home region recorded in a strongly consistent store (a consensus-based lease: etcd, Spanner-like or ZooKeeper), with fencing tokens.
- Assignment writes use idempotency keys and conditional writes (compare-and-set on the trip state), so a retry or a split brain can't double-assign.
- On failover, the standby region takes over the lease only after the old lease expires (fencing), replays in-flight state from the replicated log, and resumes.
- Drivers and riders reconnect to the new region. Accept a few seconds of unavailability rather than inconsistency (choose consistency for assignment).

**A Kafka consumer group lags by minutes during a surge while producers look healthy. How do you find out why?**

→ [Kafka lag](../topics/sre-observability.md#kafka-lag). Check whether consumers are capped at the partition count, look for hot partitions from skewed keys (one busy city), rebalancing storms, slow downstream writes, and consumer CPU throttling or GC. Measure lag per partition and processing time per message.

**Plan capacity for a New Year's Eve peak that's 5–10x normal traffic.**

- Forecast from previous years and current growth, broken down per city and time zone (the peak rolls around the globe).
- Load-test to that level plus margin in a production-like environment.
- **Pre-scale**: raise ASG and node minimums ahead of time, pre-warm load balancers and caches, raise quotas, reserve capacity (On-Demand Capacity Reservations). Don't rely on reactive autoscaling alone.
- Freeze non-essential deploys and staff a war room.
- Prepare graceful-degradation switches: turn off non-critical features, and use load shedding by priority.

**A stateful service on Kubernetes needs zero-downtime node upgrades. Walk through PDBs, draining and data safety.**

- Several replicas with data replication handled by the app (or an operator), spread across nodes and AZs.
- A **PDB** with `maxUnavailable: 1`, so only one replica drains at a time.
- Drain one node: `kubectl drain` evicts the pod (with a `preStop` hook so the database steps down as leader and flushes), the StatefulSet recreates it on another node, and the PVC re-attaches (same AZ, so use zonal node pools).
- Wait for the replica to resync and become Ready before moving on (the operator or readiness gate checks replication lag).
- Back up first and verify restores. → [Core: PDB](../core-answers.md#pdb)

**How do you secure service-to-service calls (mTLS, workload identity, cert rotation) at scale?**

- A service mesh (Istio, Linkerd) or SPIFFE/SPIRE issues each workload a short-lived X.509 identity (SPIFFE ID) based on its Kubernetes service account.
- Sidecars or ambient proxies do **mTLS** automatically, and certificates rotate every few hours with no app change.
- Authorisation policies allow specific service-to-service calls (default deny).
- Protect the root CA (offline or in an HSM, with intermediates per cluster), alert on rotation failures, and use permissive mode during migration.

## Round 2: RCA and fire drills

**Ride requests succeed but ETAs are wrong in one city only. Dashboards look healthy.**

It's a correctness problem, not availability, so the dashboards miss it. Check that city's data inputs:

- Map or traffic data feed stale (an ingestion lag for that region).
- A city-specific config or feature flag, a time-zone or locale bug.
- A routing-engine shard or cache for that geography serving old data.
- A recent deploy limited to that cell.

Compare the predicted ETA against actual arrival time (an accuracy SLI that's worth adding).

**A deploy raised p99 by 300 ms. Rollback fixes it, but nobody can reproduce it in staging.**

Staging lacks production's traffic mix, data volume, cache state and concurrency. Approaches:

- Diff the deploy (code, config, dependencies).
- Canary it again with profiling on (continuous profiler, traces on canary pods) and compare flame graphs against the baseline.
- Shadow traffic or traffic replay into an isolated environment.
- Look for N+1 queries on real data sizes, lock contention under concurrency, a GC change, or a new dependency call.

**Redis cache hit rate drops from 95% to 60% after a harmless-looking release. Why?**

- **Key format changed** (new prefix, serialisation or version in the key), so everything misses.
- TTLs shortened, or the cache was flushed on deploy.
- The value got bigger, so memory filled and the **eviction** rate rose (check `evicted_keys`, `maxmemory-policy`).
- Requests now include a high-cardinality parameter (a timestamp or user ID) in the key.
- The client points at a different cluster or database index.

Watch the miss storm hitting the database too.

**The surge pricing service times out while the database looks idle. Where do you look?**

Between the service and the database:

- **Connection pool exhaustion** (threads waiting for a connection: pool metrics), or locks held by long transactions.
- Thread pool saturation in the service, a slow upstream it calls first.
- Network or DNS to the database endpoint, a proxy (PgBouncer, RDS Proxy) limit.
- Timeouts shorter than the normal latency.

An idle database plus timeouts nearly always means requests are waiting *before* they reach it.

**Your cloud bill jumps 30% overnight with no new launches.** → [Core: cost spike](../core-answers.md#cost-reduction) (bill spike section).

## Round 3: Leadership and platform ownership

**How do you build reliability ownership across hundreds of teams with different priorities?**

Clear service ownership in a catalogue, tiered SLOs with error-budget policies agreed with product leadership, reliability scorecards (SLO met, on-call health, production-readiness checks), paved-road tooling that makes the reliable path easy, and regular reviews where leadership looks at the scorecards. Reward reliability work in planning and promotions.

**Cut infra cost by 20% without hurting reliability.** → [Meesho round 1](meesho.md) and [Core: cost reduction](../core-answers.md#cost-reduction).

**How do you run an incident bridge when 100 people join and nobody owns it?** → [Core: incident response](../core-answers.md#incident-response)

**How do you prove a platform investment actually paid off?** Define success metrics *before* building: lead time, deploy frequency, change failure rate, MTTR, time to first deploy for a new service, infrastructure cost per unit, developer satisfaction (survey). Measure the baseline, then adoption and outcomes afterwards, and turn engineering hours saved into money.
