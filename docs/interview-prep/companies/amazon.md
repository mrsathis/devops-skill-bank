---
tags:
  - interview
  - sre
---

# Amazon: Senior DevOps Engineer

## Round 1: Flash-sale scale, Kubernetes, cloud and Linux

**Design autoscaling for a 40x traffic spike in the first 10 minutes of Prime Day without over-provisioning for the rest of the year.**

Reactive autoscaling alone can't add 40x in minutes (node launch plus image pull plus warm-up). Combine:

- **Scheduled or predictive pre-scaling** before the known start time (raise HPA minimums and node pool capacity, placeholder pods for warm spare capacity, capacity reservations for the window), then scale back afterwards.
- **Fast reactive scaling** for the variance: HPA on request rate or concurrency, Karpenter for nodes, pre-pulled images.
- **Demand shaping**: queue-based admission (a waiting room), caching product pages at the CDN, async order processing.
- **Degradation levers**: turn off non-critical features.

Pay for peak capacity only for those hours: on-demand or Spot plus reservations scoped to the event.

**Checkout pods are healthy but order confirmation emails are silently backing up 20 minutes. Your first 3 diagnostic steps?**

1. Measure **age of oldest message** and consumer throughput on the email queue or topic. Is it falling behind or stuck?
2. Check the email consumer and its dependency: send-rate throttling by the email provider (SES sending quota), error or retry rates, a DLQ filling up.
3. Trace one order end to end with timestamps to find where the delay starts (the event publisher, the queue, the consumer, or the provider).

**Use Istio traffic shifting to canary a payment-service update during a live sale, with automatic rollback if error rates cross 0.5%.**

A VirtualService with weighted routes between stable and canary subsets (1%, 5%, 25%…). Use **Argo Rollouts or Flagger** to automate the steps, with an analysis template querying Prometheus for the canary's error rate (`5xx / total`, plus payment success rate). If it's > 0.5% over the analysis window, abort and shift 100% back to stable. Also keep the canary's database changes backward compatible and payment processing idempotent.

**Pod anti-affinity so a single AZ failure doesn't take out checkout during peak.** → [JioHotstar answer](jiohotstar.md): topology spread across zones with `maxSkew: 1`, enough replicas that 2 of 3 AZs can carry peak load, zonal node pools, PDBs, and zonal data stores with Multi-AZ failover.

**Detect if the HPA is scaling on stale metrics before it silently under-provisions during a spike.** Alert on metric staleness (the adapter's last-scrape age), on HPA conditions (`ScalingActive=False`), on desired replicas staying flat while request rate rises, and on queue or latency SLIs as a backstop. Test the scaling path in load tests.

## Round 2: RCA, fire drills and flash-sale chaos

**Cart abandonment spikes 15% for exactly one payment method, one region, at peak. CPU, memory and pods all green. Triage path?**

The narrow scope points to a **dependency** specific to that combination: the third-party payment gateway or bank for that method in that region (latency, errors, rate limits), a regional config or feature flag, a certificate or API key for that provider, fraud-rule thresholds tuned for normal traffic now declining legitimate transactions, or a front-end change for that method. Check per-provider success rate and latency, the provider's status, and the logs of failed attempts. Mitigate by routing to a backup processor, or by steering users to other methods.

**An inventory-sync Kafka topic lags 90 s during a flash sale. Producers healthy, consumers at 0% CPU.** → [JioHotstar answer](jiohotstar.md): consumers are waiting, not working. Rebalancing, hot partitions, blocked I/O (a database lock or a throttled downstream such as DynamoDB throttling with back-off), or paused consumers.

**Redis session-store tail latency spikes only during checkout, not browsing. Isolate it in under 10 minutes.** The difference is the **access pattern**: checkout likely does writes, transactions (`MULTI`/`WATCH`), larger session payloads (the cart), or Lua scripts that block the single thread. Run `SLOWLOG` filtered on checkout commands, check big keys, and `INFO commandstats` latency per command. → [JioHotstar Redis answer](jiohotstar.md)

**HPA won't scale a critical pod set even though Prometheus shows CPU at 92%. Root cause and live fix?** → [Core: HPA](../core-answers.md#hpa). Live fix: manually `kubectl scale` (or raise `minReplicas`) to buy time, then fix the HPA (metrics pipeline, requests, `maxReplicas`).

## Round 3: Leadership and reliability culture

**Get a business team to treat checkout latency as seriously as "site up or down".** Show them the data: conversion against latency (every extra 100 ms costs X% of orders, measured on your own traffic), turn it into revenue, set a latency SLO with their sign-off, and report it alongside sales metrics.

**Ship multi-region failover for the next flash sale in 10 days, no DNS routing allowed.** → [Netflix answer](netflix.md)

**Chaos-test your payment pipeline without risking a single real transaction.** Use the payment provider's sandbox and test cards, shadow traffic into an isolated pipeline that never sends to real processors (a stub), fault injection in staging (provider timeouts, partial failures, duplicate callbacks) to test idempotency and retries, and production experiments only on synthetic test accounts.
