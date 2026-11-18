---
tags:
  - interview
  - finops
---

# Meesho: Senior DevOps Engineer

**Theme:** cutting cloud cost without hurting reliability. Source: saved LinkedIn post (Nov 2026).

## Round 1: Cut the cloud bill by 40%

**1. You must cut the monthly cloud bill by 40% in a quarter without hurting reliability. Where do you start?**

With visibility, not cuts. I'd get cost broken down by service, team and environment (CUR plus tags, Kubecost for clusters), then rank the top 10 cost drivers, because they're usually most of the bill. I'd also agree the guardrail with the business up front: SLOs must not regress, measured weekly. Then I'd work in waves by effort and risk:

1. **Waste**: idle resources, unattached volumes, old snapshots, dev environments running 24/7. Low risk, quick.
2. **Right-sizing**: Kubernetes requests set from p95 usage, instance families, Graviton.
3. **Commitments**: Savings Plans for the steady baseline that's left after right-sizing. Commit *after* right-sizing, or you lock in waste.
4. **Spot** for stateless and batch workloads.
5. **Architecture**: data transfer, storage tiers, caching.

Each change ships behind the same deploy safety as code (canary, monitoring), and I track savings against a baseline. → [Core: reducing cloud cost](../core-answers.md#cost-reduction)

**2. How do you find which team or service is responsible for each rupee of spend?**

A mandatory tagging standard (`team`, `service`, `env`, `cost-center`) enforced with tag policies, SCPs or Azure Policy, and Terraform default tags, with untagged resources reported and blocked in CI. A separate account per team or environment gives clean attribution for free. For shared Kubernetes clusters, allocate by namespace and labels using Kubecost or OpenCost (requests and usage × node price), and split shared costs (control plane, NAT, observability) with an agreed key such as proportional usage. Publish **showback** dashboards per team, then move to **chargeback** once the data is trusted.

**3. Which workloads can safely run on Spot, and how do you handle interruptions?**

Safe: stateless, horizontally scaled services with several replicas, CI runners, batch and data jobs that checkpoint, dev and test. Not safe: single-replica stateful services, databases, long jobs that can't checkpoint, latency-critical singletons.

Handling interruptions:

- Diversify across many instance types and AZs (Karpenter or ASG mixed-instance policies, `price-capacity-optimized` allocation).
- React to the 2-minute notice and rebalance recommendations (Karpenter's interruption queue or the AWS Node Termination Handler cordon and drain the node).
- PDBs, enough replicas, topology spread across AZs.
- Graceful shutdown well under 2 minutes.
- Keep an on-demand baseline (for example 30%) for critical tiers.

**4. How do you right-size requests and limits when nobody trusts the numbers?**

Replace opinion with data. Collect at least 2–4 weeks of real usage, including peaks (Prometheus `container_cpu_usage_seconds_total` and working-set memory), and use VPA in recommendation-only mode or Goldilocks. Set CPU requests near p95 usage, memory requests near peak plus headroom, memory limit equal to or a little above the request (memory isn't compressible), and often no CPU limit, to avoid CFS throttling. Roll out one service at a time, starting with the least critical, watch latency and OOMs, and keep a fast revert. Show teams the before and after, so trust comes from evidence.

**5. What does data transfer cost, and how would you cut it?**

On AWS, inbound is free. Charges apply to internet egress, **cross-AZ** traffic (charged in each direction), cross-region traffic, and **NAT Gateway processing** per GB on top of the transfer. Ways to cut it:

- VPC gateway endpoints for S3 and DynamoDB (free) and interface endpoints for ECR and other AWS APIs, so traffic skips NAT.
- Topology-aware routing in Kubernetes to keep traffic in the same AZ where it's safe.
- CloudFront in front of origins (origin-to-CloudFront transfer is free, and edge egress is cheaper and cached).
- Compress payloads, and cut chatty service-to-service calls.
- Ship logs through endpoints, not NAT.
- Measure with VPC Flow Logs and CUR usage types (`DataTransfer-Regional-Bytes`, `NatGateway-Bytes`).

## Round 2: When savings break things

**1. After consolidation, p99 latency doubled. How do you find the cause?**

Consolidation packs more pods on fewer nodes, so look for contention:

- CPU throttling (`container_cpu_cfs_throttled_periods_total`).
- Noisy neighbours on the same node (correlate p99 with node and co-located pods).
- Memory pressure causing GC pauses.
- Network or conntrack limits, or EBS and ENI bandwidth caps on smaller instances.
- Pods now crossing AZs, or losing local cache affinity.
- Bin-packing that put all replicas on one node.

Compare p99 per node and instance type, and roll back the consolidation on part of the fleet as a controlled experiment. Fix with correct requests, topology spread, a node-pool split for latency-critical services, and consolidation budgets.

**2. Spot interruptions took out a whole tier at once. How was this avoidable?**

All replicas were in one Spot pool (the same instance type and AZ), so one capacity reclaim hit them all. Avoid it by diversifying instance types and AZs, using topology spread constraints and anti-affinity, keeping an on-demand baseline for that tier, setting PDBs, handling rebalance signals early, and testing it with a game day that simulates interruptions.

**3. Costs spike every month-end. How do you investigate?**

Group the CUR by day, service and usage type to see what spikes. Usually it's month-end batch jobs (reporting, billing, reconciliation) scaling up, ETL reprocessing, log or query volume (Athena, CloudWatch Logs Insights), or backups and snapshots. Then optimise that job: schedule it on Spot, right-size it, use incremental processing, partition the data, or cache results. If the spike is legitimate business demand, plan capacity and budget for it instead of treating it as an anomaly.

**4. Autoscaling oscillates, scaling up and down every 5 minutes. What do you tune?**

That's flapping: the metric reacts to the scaling itself. Tune the HPA `behavior`: a longer scale-down stabilisation window, rate-limiting policies (for example scale down at most 10% per minute), and a target with headroom (target 60–70%, not 90%). Make sure readiness and startup are accurate so new pods aren't counted before they're warm. Consider a smoother metric (requests per second, queue depth through KEDA) instead of spiky CPU. At node level, tune Karpenter or Cluster Autoscaler consolidation delays.

**5. Dev environments cost more than production. What is your plan?**

- Schedule them: scale to zero outside working hours (KEDA cron, Instance Scheduler).
- Ephemeral preview environments with a TTL that are destroyed on PR merge.
- Smaller instance sizes and Spot.
- Shared clusters with namespace quotas instead of a cluster per developer.
- Smaller databases, or shared ones with separate schemas, and short log retention.
- Budgets with alerts per team, and cleanup of orphaned resources.

## Round 3: Leadership and judgement

**1. A team refuses to give up over-provisioned capacity. How do you handle it?**

Understand their fear first. Usually a past incident or a peak they worry about. Bring data (utilisation against peaks), propose a staged reduction with a clear rollback trigger tied to their SLO, and keep the autoscaling headroom they need. Showback makes the cost visible to their leadership. If it's still blocked, escalate as a business trade-off (cost against risk) for the product owner to decide, not as a fight.

**2. How do you show savings that the CFO believes?**

Measure against a documented baseline, normalised for growth: **unit economics** (cost per order or per active user), not just total spend. Separate realised savings (on the invoice) from avoided costs. Reconcile with finance's own CUR or invoice data, attribute each saving to a specific change, and report monthly with the reliability KPIs next to it, to show nothing broke.

**3. Tell me about a saving you declined because of the risk.**

Use STAR. A good example: moving a stateful, latency-critical tier (or a single-AZ database) to Spot or a smaller instance looked cheap, but the failure mode was customer-facing downtime and data risk. You declined it, quantified the expected cost of an outage against the saving, and proposed a safer alternative (Savings Plans or Graviton) that delivered most of the benefit. → [Core: behavioural](../core-answers.md#behavioural)

**4. How do you make cost part of engineering culture, not a quarterly panic?**

- Put cost in front of engineers where they work: per-service dashboards, cost in PR plans (Infracost), budgets and anomaly alerts routed to the owning team.
- Track a unit-cost KPI next to SLOs.
- Add cost to architecture reviews and production-readiness checklists.
- Run a monthly FinOps review with engineering, finance and product.
- Celebrate wins publicly, and make the efficient path the default (golden-path templates with sensible requests, scheduling and tagging built in).
