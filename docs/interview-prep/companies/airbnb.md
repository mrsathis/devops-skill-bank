---
tags:
  - interview
  - sre
---

# Airbnb: Senior DevOps Engineer

## Round 1: Marketplace scale, Kubernetes and data reliability

**Search latency must stay low during a holiday-booking surge. How do you plan autoscaling and cache warming?**

- Forecast the surge from history and marketing calendars, load-test to it, and **pre-scale** (raise HPA `minReplicas` and node capacity ahead of time) rather than relying only on reactive scaling.
- Scale on request rate or concurrency (KEDA, custom metrics) instead of CPU alone.
- **Warm caches before traffic arrives**: precompute popular search results and availability for top destinations, warm the CDN and app caches with synthetic requests, and stagger TTLs to avoid synchronised expiry.
- Use request coalescing for cache misses, degrade gracefully (serve slightly stale availability with a disclaimer), and set SLOs on p99 search latency.

**Design a zero-downtime database migration for a table with billions of rows and live writes.**

Use the **expand and contract** pattern with online tooling:

1. **Expand**: add new columns or tables in a backward-compatible way, using online schema change tools (`gh-ost` or `pt-online-schema-change` for MySQL, concurrent index builds in Postgres) to avoid long locks.
2. **Dual write**: the app writes to old and new.
3. **Backfill** in small, throttled batches, keyed by primary key and checkpointed, while watching replication lag.
4. **Verify**: run consistency checks that compare old and new.
5. **Switch reads** behind a feature flag, gradually.
6. **Contract**: stop writing the old column and drop it in a later release.

Keep rollback possible at every step.

**Structure multi-tenant Kubernetes clusters so one team's noisy workload can't hurt another's.**

- A namespace per team with **ResourceQuotas** and LimitRanges, and requests and limits required (enforced by policy).
- PriorityClasses so critical workloads pre-empt batch.
- Separate node pools (taints and tolerations) for heavy or batch workloads.
- NetworkPolicies, and API Priority and Fairness to protect the API server.
- Per-team cost and usage visibility. For hard isolation (security or compliance), use separate clusters or virtual clusters (vCluster).

**How would you set different SLOs for search, booking and payments?**

By user impact and the nature of each journey:

- **Search**: latency-critical (p99 < X ms) with moderate availability (99.9%), and staleness tolerated.
- **Booking**: high availability and correctness (99.95%+), with no double bookings.
- **Payments**: the strictest correctness and availability (99.99%), idempotency required, and a latency budget that includes third-party processors.

Error-budget policies differ too: payments freeze earlier.

## Round 2: RCA and fire drills

**Bookings succeed but confirmation emails are delayed 40 minutes. The queue looks healthy.**

"Healthy" queue depth can hide problems. Check:

- The **age of the oldest message**, not just depth. Consumers may be processing slowly or retrying.
- Throttling by the email provider (SES or SendGrid rate limits, so the send rate is capped).
- A retry or back-off loop on one bad message blocking a FIFO group.
- Messages going to a delay queue or DLQ.
- Consumer concurrency reduced by a deploy.
- The email-rendering service being slow.

Trace one booking end to end, using its timestamps at each hop.

**Search results are stale in one region after a cache-layer change.**

The change likely broke **invalidation** for that region: the invalidation events or pub/sub don't reach that region's cache cluster (replication config, topic or subscription missing), the TTL changed, the key format differs so invalidations target the wrong keys, or the CDN caches more than intended. Compare cache hit rate and age per region, check the invalidation pipeline's lag, and roll back the change while you fix it.

**TLS certificates expire at 3 a.m. and take down an internal API. How do you make sure it never recurs?** → [Core: TLS](../core-answers.md#tls). Automate renewal (cert-manager, ACM or an internal CA with short-lived certs), keep a certificate inventory, alert on expiry at 30/14/7 days and on renewal failures, and add a synthetic check that validates the chain. Postmortem action: find every other manually managed certificate.

**Database CPU is 20% but connection pool saturation is causing timeouts. Why?**

The database isn't busy computing, but **connections are held too long or there are too few**:

- Long transactions or idle-in-transaction sessions.
- Slow external calls made while holding a connection.
- Lock waits (CPU is idle while waiting).
- A pool size too small for the concurrency, or too many app pods × pool size hitting `max_connections`.
- Connection leaks (not returned to the pool).

Check `pg_stat_activity` (state, wait events), pool metrics (wait time, active against idle), and fix it with proper pool sizing, a pooler (PgBouncer or RDS Proxy), short transactions and timeouts.

## Round 3: Leadership and influence

**Align platform priorities with product teams who want features first.** Tie platform work to their outcomes (faster deploys, fewer incidents, cost), use error budgets as the shared contract, co-plan quarterly with product, and deliver visible quick wins.

**When do you migrate a legacy service versus patch it?** Weigh how often it changes, incident and toil cost, security or compliance risk (unsupported runtime), scaling limits, and the cost of migration. Patch if it's stable, rarely changes and the risk is low. Migrate if it blocks the roadmap or keeps causing incidents, and do it incrementally (strangler pattern).

**You need a deploy freeze during peak travel season. How do you handle the pushback?** Explain the risk with data (incident history in previous peaks, revenue at risk per hour), scope the freeze narrowly (critical paths only, with an exception process for fixes and security), announce it well ahead, and offer alternatives (dark launches behind flags, deploy before the freeze).

**How do you measure developer productivity without people gaming the metrics?** Use DORA metrics at team level (not individual), SPACE-style balanced measures, and developer experience surveys. Measure outcomes and friction (build time, time waiting on reviews), use metrics to find bottlenecks rather than to rank people, and never tie them to individual performance.
