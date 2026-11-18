---
tags:
  - interview
  - sre
---

# SRE, observability and incident questions (company not named)

## Core SRE concepts

**What is SRE?** Site Reliability Engineering is Google's approach to operations: treat operations as a software problem. It measures reliability with **SLIs and SLOs**, balances velocity and reliability with **error budgets**, caps and automates **toil**, runs blameless postmortems, and shares ownership of production with developers. DevOps is the culture and philosophy. SRE is one concrete way to implement it.

**SLI, SLO, SLA, error budgets; SLO vs SLA and why it matters to engineering.** → [Core](../core-answers.md#slo). It matters because the SLO is *your* engineering target with room to act before the contractual SLA (with financial penalties) is breached. Engineering decisions (release pace, priorities) are driven by the SLO, not by the SLA.

**Metrics vs logs vs traces; observability; tracing in distributed systems; RED and USE; Prometheus, Grafana, OpenTelemetry; cardinality and alert fatigue; end-to-end observability design.** → [Core](../core-answers.md#observability)

**How do Prometheus and Grafana interact? The data source for Prometheus? What does Prometheus need to collect metrics? Prometheus metrics collected; app-level metrics and logs; Grafana data sources; a default data source for new panels.** → [Core](../core-answers.md#observability). Prometheus needs targets exposing a `/metrics` endpoint in the Prometheus text or OpenMetrics format, reachable over the network, and discovered through scrape configs or service discovery (in Kubernetes, ServiceMonitors and PodMonitors through the Operator, or `prometheus.io/scrape` annotations in some setups). **App metrics**: instrument with a client library (counters, gauges, histograms) or OpenTelemetry. **App logs**: stdout → Fluent Bit or Promtail → Loki or Elasticsearch. **Default data source in Grafana**: mark it as default in *Connections → Data sources* (the "Default" toggle), or provision it with `isDefault: true` in a datasource provisioning YAML. New panels then use it automatically.

**Install Grafana and show logs and metrics.** Install through Helm (`grafana/grafana`, or kube-prometheus-stack) or a package, provision data sources (Prometheus for metrics, Loki or Elasticsearch for logs, Tempo for traces) and dashboards as code, set up SSO, then build panels and use Explore to correlate logs with metrics (derived fields linking trace IDs).

**Describe Grafana and ELK to someone who doesn't know them.** **Grafana** is a dashboarding tool that turns numbers from many sources into live graphs and alerts: one screen showing how healthy your systems are. **ELK** (Elasticsearch, Logstash, Kibana) is a search engine for logs: it collects every application's log lines in one place so you can search them like Google, and Kibana visualises them.

**Monitoring importance; setting up monitoring; tools; alerting role; meaningful alerts; securing monitoring data.** → [Core](../core-answers.md#alerting). Secure monitoring data: RBAC and SSO on dashboards, TLS for scrapes and remote write, mask PII in logs, retention policies, and network restrictions (metrics endpoints aren't public).

**Monitoring a microservices architecture.** RED metrics per service (mesh or library instrumentation), distributed tracing with propagated context, centralised structured logs with trace IDs, service maps, dependency dashboards, SLOs per user journey, synthetic checks, and alerting by service ownership.

**Logs and metrics definitions; creating monitors; high utilisation seen on a dashboard: first step and fix.** **Metrics** are numeric measurements over time (aggregated, cheap, for trends and alerts). **Logs** are timestamped event records with detail (for investigation). High utilisation: confirm the scope and timing (which app or cluster, since when, did a deploy or traffic change happen?), check whether it's affecting users (latency, errors). Mitigate (scale out, rate-limit, roll back), then drill down to which pod or process and why (profiling, traffic source), and fix (right-size, fix the code path, autoscaling). Add an alert on the saturation trend.

**What does Dynatrace/Splunk architecture look like; success and failure rates.** → [Mphasis](../companies/mphasis.md)

**Incident management priority categories (P1–P4).** Priority = **impact** (how many users or how much revenue, how critical the service) × **urgency** (is it degrading, is there a workaround). For example: P1/SEV1 means a critical service is down or there's data loss for many users (immediate, all hands). P2 is major degradation or a key feature broken with a workaround. P3 is minor or limited impact. P4 is cosmetic or a request. Each has response and update SLAs. → [Core: incident response](../core-answers.md#incident-response)

**IR vs SR (incident request vs service request).** In ITIL terms, an **incident** is an unplanned interruption or degradation of a service (restore it fast). A **service request** is a standard, pre-approved user request (access, a new VM, password reset), fulfilled through a catalogue and not urgent. (In some contexts IR also means "incident response".) Different queues, SLAs and processes.

**Handling P1 incidents; production down at 2 AM (detection → investigation → mitigation → RCA); the system goes down, how do you approach it.** → [Core](../core-answers.md#incident-response)

**Blameless postmortems; postmortem after a large-scale outage.** → [Core](../core-answers.md#postmortem)

**Toil; MTTR, MTTD, MTBF; SRE KPIs (availability, error budgets, MTTR, MTBF, change failure rate, incident volume).** → [Core](../core-answers.md#toil-metrics)

**On-call strategies.** → [LinkedIn](../companies/linkedin.md)

**Cascading failures; circuit breakers; retries and timeouts; graceful degradation; backpressure.** → [Core](../core-answers.md#resilience)

**What are runbooks? When is a runbook worse than no runbook?** → [J.P. Morgan #7](../companies/jp-morgan.md)

**The same alert fires every Monday at 9 a.m.** → [Core](../core-answers.md#alerting)

**Three services, one on-call rotation: design alerts so the right person wakes up.** Alerts carry **service ownership labels**, Alertmanager or PagerDuty routes by service to the right escalation policy (even with one rotation, include the service, a runbook link and the owning team for daytime follow-up), page only on SLO burn and user impact (non-urgent issues go to tickets), inhibit downstream alerts when the upstream is down, and escalate to the service's expert as secondary.

**Dashboards are green, users say it's broken.** → [Barclays](../companies/barclays.md)

## Failure scenarios

**A service returns 200 but the data is stale.** It's a correctness problem at the cache layer. Map the **cache hierarchy** (browser, CDN, API gateway cache, app in-memory cache, Redis, DB read replica) and prove which layer served the stale value: response headers (`Age`, `X-Cache`, `Cache-Control`, ETags), request directly to each layer, compare with the primary database, and check replica lag (read-after-write to a lagging replica). Fix: proper invalidation on write (events), TTLs that match freshness needs, read-your-writes routing to the primary, versioned cache keys.

**A deploy went out at 10:00, the error rate doubled by 10:03, p99 is fine.** Not capacity (latency fine). Correlate errors to the change: are the errors only on new-version pods or canary cohorts? A new code path, a feature flag flipped with the release, a config or schema change? Check error types (4xx vs 5xx, which endpoint). If the errors are clearly tied to the release and hurting users, rolling back is legitimate, but show you checked whether rollback is safe (data migrations) and whether a flag-off is faster.

**CPU 4%, memory 6%, users say it's slow.** → [Core](../core-answers.md#latency-normal-resources)

**A pod is OOMKilled every 6 hours exactly.** Periodic means it's triggered: a **cron or scheduled job** inside the app (report generation, cache rebuild), a **leak that grows with traffic** until it hits the limit at a predictable time, a sidecar's periodic task, log or buffer growth, or a JVM heap or direct memory misconfiguration with GC unable to keep up. Plot memory over time, align with schedules, take heap dumps just before the kill, and compare the memory curve's slope with traffic. → [Core: OOMKilled](../core-answers.md#oomkilled)

**Region A is healthy, Region B returns 503s at the load balancer, and app logs in B are clean.** Requests never reached the app: **health-check misconfiguration** (targets marked unhealthy, so the LB has no targets), target registration, security groups between LB and targets in B, TLS handshake failures between LB and targets, a regional dependency used by the health check, DNS or failover routing lag, or asymmetric routing in multi-region networking. Check the LB metrics (`HealthyHostCount`, `ELB_5XX` vs target 5xx) and health check reasons.

<a id="kafka-lag"></a>

**Kafka lag is 10 million / consumer lag growing / ingestion lags during surges.**

1. **Is the producer surging, or did the consumer slow down?** Compare the produce rate against the consume rate per partition.
2. **Consumers**: count vs partitions (parallelism is capped at the partition count), **rebalance storms** (`max.poll.interval.ms` exceeded by slow processing, liveness kills, deploys), processing time per batch (slow sink: DB, API, throttling), GC or CPU throttling, errors and retries on a poison message stalling a partition.
3. **Partitions**: a **hot partition** from a skewed key (one consumer overloaded while others idle).
4. **Brokers**: request latency, under-replicated partitions, disk or network saturation, quotas.
5. **Downstream sink** stopped or slow.

Fix accordingly: scale consumers (and partitions, if there's a real reason), batch and parallelise processing within partitions where ordering allows, a DLQ for poison messages, tune poll and session settings, fix the slow sink. Don't "just add partitions" without knowing why (it changes key-to-partition mapping and ordering).

**A junior ships a change, tests pass, prod breaks in a way no test would catch.** Blameless review. Find the **missing test category or safeguard** (contract tests, load or performance tests, chaos or failure-injection tests, production-like data, canary analysis) and add it to the pipeline. The system allowed it, so improve the system and support the engineer.

**CPU 35%, memory 48%, latency +900%. Next signal?** Saturation elsewhere: dependency latency (traces), connection or thread pool waits, throttling (CPU CFS throttling, API rate limits), queue depth, GC pause time, disk I/O wait, network retransmits, DNS time. → [Core](../core-answers.md#latency-normal-resources)

**Terraform wants to recreate 40 production resources, nobody changed the code.** Something else changed: the **provider version** was upgraded (an unpinned provider, so schema or default changes force replacement), a **module source** floating on a branch, a refreshed `data` source returning a new value (a latest AMI ID → instances replaced), a variable default or tfvars changed in CI, **drift** on a ForceNew attribute (someone changed it in the console), or the wrong workspace or state (an empty state means it'll create everything). Read the `# forces replacement` reason, pin versions, and never apply until it's understood.

**DNS works from your laptop but fails intermittently inside Kubernetes.** → [Core: DNS](../core-answers.md#dns)

**One AZ is slow, other AZs healthy, same app and deployment.** It's infrastructure local to that AZ: an underlying AWS issue (check AWS Health, and use **ARC zonal shift** to move traffic away), a noisy neighbour or degraded instances in that AZ, a dependency instance in that AZ (the DB primary or cache node lives there, so cross-AZ calls from other AZs are fine but local ones fail?), a subnet or NAT gateway in that AZ (NAT port exhaustion), or EBS latency in that AZ. Compare metrics by AZ label, then shift traffic and investigate.

**GPU utilisation drops from 92% to 24% with no deployment, VRAM still allocated.** The GPU is waiting on something: **data pipeline starvation** (data loader or CPU preprocessing bottleneck, storage or network throughput to the dataset dropped, so check I/O and network), **NCCL or communication stalls** (one slow rank in distributed training, network issues between nodes, NVLink or InfiniBand errors), **thermal or power throttling** (`nvidia-smi -q -d PERFORMANCE,CLOCK,TEMPERATURE`), a **hung process** (memory still allocated, kernels stalled, Xid errors in `dmesg`), or a checkpoint-writing phase blocking compute. Use DCGM metrics (SM activity, PCIe and NVLink throughput), `py-spy` on the trainer, and storage metrics.

**The database recovered but the application didn't. Why might restarting the app make it worse?** → [Core: resilience](../core-answers.md#resilience). Also: apps may hold **broken connections** in their pools that never got validated (enable pool validation and test-on-borrow, max lifetime), circuit breakers stuck open, or DNS caching the old database IP after failover (JVM DNS TTL).

**Application latency jumped from 200 ms to 5 s / a deployment raised response time; investigating 503s; CPU at 95–100%; disk at 95%.** → [Core: latency](../core-answers.md#latency-normal-resources), [5xx](../core-answers.md#http-5xx), [CPU](../core-answers.md#high-cpu), [disk](../core-answers.md#disk-full)

**Monitoring application availability and latency.** Synthetic probes (blackbox exporter, CloudWatch Synthetics) for availability from the outside, server-side RED metrics with latency histograms (percentiles), SLOs with burn-rate alerts, and RUM for the client side.

**Achieving a 99% (or higher) uptime target using monitoring and alerting.** 99% allows ~7.2 hours of downtime a month. Define the SLI (successful requests or successful probes), measure it continuously, alert on burn rate so you react before the budget is spent, reduce MTTD (good alerts) and MTTR (runbooks, quick rollback, on-call), find recurring causes through postmortems, and build redundancy (HA) so failures don't become outages.

**A large-scale data pipeline's latency increases significantly.** Find which stage: per-stage metrics (ingest, process, store), backlog and age per queue or topic, throughput vs input rate. Usual causes: input surge, a slow sink (database or warehouse throttling), skewed partitions or hot keys, resource saturation in workers (CPU, memory, GC), back-pressure from downstream, failing records causing retries, or a slow dependency. Scale the bottleneck stage, fix skew, batch writes, and add autoscaling on lag.

**A production application is down: investigate.** → [Core](../core-answers.md#incident-response)

**Meaningful alerts for a production app.** → [Core](../core-answers.md#alerting)

**10x normal traffic suddenly: handle it.** Short-term: autoscaling (pods and nodes), CDN caching, rate limiting and load shedding for abusive or low-priority traffic, turning off non-essential features, scaling databases (read replicas, cache). Find out whether it's legitimate or an attack (WAF, bot management). Long-term: design for elasticity (stateless, queues to absorb bursts, pre-scaling for known events, load testing at 10x).

## Senior SRE leadership scenarios

**Repeated outages during peak traffic: root cause and improving resilience.** Analyse the incidents together for common themes (capacity, dependencies, deployments during peak, retries amplifying load), load-test to peak plus margin, fix architectural single points of failure, capacity planning with headroom and pre-scaling, resilience patterns (timeouts, circuit breakers, shedding), a change freeze or tighter change control in peak windows, and SLO tracking for peak periods.

**Uptime targets met, but customers see latency and intermittent failures: better SLIs and SLOs.** The SLI measures the wrong thing (uptime pings instead of real user requests). Redefine SLIs from the user's perspective: request success rate and **latency percentiles per critical journey**, measured at the edge or load balancer (or RUM), excluding nothing that users feel. Set SLOs with the business, error budgets and burn-rate alerts, and review them quarterly.

**Lead incident response for a major incident across many teams.** → [Core](../core-answers.md#incident-response)

**Frequent releases introduce incidents: reliability gates, deployment safeguards, canaries, rollback, change management.** Progressive delivery with automated canary analysis, error-budget policies gating releases, required pre-production tests, feature flags, automated rollback on SLO breach, smaller and more frequent changes, risk-based change management (lightweight for low risk, review for high risk), deploy freezes at peak, and tracking the change failure rate.

**Issues found only after customers report them: an observability strategy.** SLO-based alerting on user journeys, synthetics for critical flows, RUM, golden signals for every service by default (platform-provided instrumentation and OTel), centralised logs and traces with correlation, dashboards per service, error tracking (Sentry), and "detected by customer" as a postmortem trigger with an action to add detection.

**Measuring SRE organisation effectiveness: KPIs.** SLO attainment and error-budget burn, MTTD and MTTR trends, incident count by severity and **repeat incidents**, change failure rate and deployment frequency (DORA), toil percentage, on-call load (pages per shift, out-of-hours pages), postmortem action completion rate, and cost per unit. → [Core](../core-answers.md#toil-metrics)

**From 99.9% to 99.99%: calculate the reliability gap and the roadmap.** 99.9% allows ~43.2 min of downtime per 30 days, and 99.99% only ~4.3 min, a **10× reduction**. Check what the incident history consumed (for example 3 outages × 30 min = 90 min, so far over even 99.9%). Find the top contributors (deploys, dependencies, capacity, infrastructure). Each nine usually needs **architectural** change: multi-AZ becomes multi-region, automated failover in seconds (humans can't respond within 4 minutes, so **automated detection and remediation** are required), progressive delivery and instant rollback, eliminate single points of failure, and dependency SLOs (your SLO can't exceed the product of hard dependencies' SLOs). Also question whether 99.99% is truly needed, given the cost.

**10,000 RPS, availability dropped from 99.95% to 99.5%: calculate the additional downtime and improve it.** Per year: 99.95% → ~4.38 h downtime, 99.5% → ~43.8 h, so **~39.4 hours more per year** (~3.3 hours more per 30 days). In requests: 0.5% of 10,000 RPS = **50 failed requests per second** vs 5 per second before, about 3.9 million extra failed requests per day (45 × 86,400). Then: break the failures down by cause (endpoint, dependency, deploy-correlated, infrastructure), fix the top contributors, and add SLO burn alerting.

**45-minute pipeline, 200 deployments a month: bottlenecks, automation, lead time.** 200 × 45 min = **150 hours of pipeline time a month**, with lead time dominated by the pipeline and waiting. Measure stage timing and queue time, parallelise tests, cache, use affected-only builds, use ephemeral environments, automate approvals for low-risk changes, and track DORA lead time and change failure rate to make sure speed doesn't increase risk. → [Core: pipeline speed](../core-answers.md#pipeline-speed)

**500 microservices on Kubernetes, costs up 35%, resource contention.** Measure requests vs actual usage per service (requests far above usage = waste, below usage = contention), right-size using VPA recommendations, set limits sensibly, HPA tuning, bin-packing and consolidation (Karpenter), node-type optimisation (Graviton, Spot for stateless), namespace quotas and showback, priority classes for critical services, and remove idle services and environments. → [Meesho](../companies/meesho.md)

**Costs up 40% in six months while traffic grew only 10%.** Unit cost per request rose about 27%. Find the drivers by service and usage type (data transfer, logging volume, over-provisioning, new services without autoscaling, storage growth). → [Core: cost](../core-answers.md#cost-reduction)

**A Kubernetes platform with 100M+ requests a day and deployments causing intermittent downtime with rising rollback rates.** Fix readiness probes and graceful shutdown (most "deploy downtime" is endpoint propagation races), `maxUnavailable: 0`, PDBs, progressive delivery with automated canary analysis, pre-deploy integration tests, backward-compatible DB changes, and SLO-gated rollouts. Track the change failure rate. → [Core: zero downtime](../core-answers.md#zero-downtime)

**A 45-minute customer outage at peak: lead response, communication, RCA and prevention.** → [Core](../core-answers.md#incident-response), [postmortem](../core-answers.md#postmortem)

**You inherit an environment with manual deployments, drift, weak monitoring, frequent incidents, poor docs: your first 90 days.** → [Architecture topic](architecture-leadership.md#first-90-days)

## Opinions and bar-raiser questions

**"Questions that are a waste of time" alternatives.** One saved post suggested better questions. Short answers:

- *A Dockerfile needs its startup command constantly overridden based on batch jobs on AWS:* use `ENTRYPOINT` for the fixed executable and `CMD` for default args, then override `command` in the ECS task definition or container overrides per job (AWS Batch job definitions or `RunTask` overrides). → [Core](../core-answers.md#cmd-entrypoint)
- *A relational DB and a NoSQL DB that both need to scale, under CAP:* during a **network partition** you choose consistency or availability. For the relational system of record (payments, orders) choose **CP** (consistency, reject writes rather than diverge). For the NoSQL store serving high-volume, latency-sensitive reads (catalogue, sessions, feeds) choose **AP** with eventual consistency and conflict resolution. Without partitions, the trade-off is latency vs consistency (PACELC).
- *10,000 servers worldwide need urgent security patching:* automate with a fleet tool (SSM Patch Manager or Run Command, Ansible at scale), canary ring first (1%), then waves by region and failure domain with automated health checks and an error threshold that halts the rollout, rolling reboots behind load balancers, mitigations where patching lags (WAF or virtual patching, isolation), and compliance reporting to track the last servers.

**Minimum bar to pass an SRE interview: walk through failure scenarios with the question each really tests.** → The scenarios above (stale 200, post-deploy errors, low CPU but slow, periodic OOM, regional 503s, Kafka lag, the junior engineer's change).

**Senior DevOps questions that "actually test something": `curl` to response, the first five actions on an OOMKill, `swapoff` and swap-like behaviour, 200 undocumented servers in 72 hours, the 40% bill jump, ECS vs EKS regret, NAT bills, half-applied Terraform, a CI pipeline you'd refuse to merge, the smallest thing to automate, SLO vs SLA, Monday-morning alerts, runbooks worse than none, microservices for four services, a queue making things slower, Postgres at 80%: CPU, RAM or disk, behavioural questions.**

- **`curl https://my-api.com`**: → [Core: URL flow](../core-answers.md#url-flow) (plus the load balancer, ingress, service, pod and database layers on the server side).
- **OOMKilled, first five actions**: confirm it (describe, exit 137) → check the memory graph against the limit → `--previous` logs → mitigate (raise the limit or roll back) → root cause (leak vs undersized, heap dump). → [Core](../core-answers.md#oomkilled)
- **`swapoff`**: turns off swap devices and forces swapped pages back into RAM (it can fail or trigger OOM if RAM is insufficient). The kernel still evicts **page cache** (file-backed pages can be dropped and re-read from disk, which looks swap-like) and may use **zram/zswap** (compressed RAM swap) if configured. Kubernetes historically required swap off (swap support is now available behind configuration).
- **200 undocumented servers in 72 hours**: automated discovery (an inventory agent or `ansible -m setup`, `ss -tlnp` for listening services, `systemctl list-units`, crontabs, package lists, network flows from VPC Flow Logs or netflow), tag by role, find owners from DNS, tickets and logs, record it in a CMDB, prioritise by risk (internet-facing, unpatched, no backups), and protect first (backups and snapshots) before changing anything.
- **AWS bill +40% in a week**: → [Core: cost](../core-answers.md#cost-reduction). Ignore small steady items and focus on the delta by service and usage type.
- **ECS over EKS, and regret**: → [Big 4](../companies/big4-aws-devops.md)
- **NAT gateway bills**: → [Core: NAT](../core-answers.md#nat-gateway). You pay **per GB processed** on top of transfer, so pulling images, S3 traffic or logs through NAT scales cost with data volume, not with compute.
- **Half-applied Terraform**: → [Core](../core-answers.md#tf-partial-apply)
- **A CI pipeline you'd refuse to merge**: long-lived cloud keys in variables, `curl | bash` from the internet, unpinned third-party actions, `:latest` images, skipping tests on main, deploying to prod without approval or rollback, secrets echoed, `continue-on-error` on security scans.
- **Smallest thing to automate for a team that ships manually**: a repeatable, scripted build and deploy for **one** service (even a single `make deploy` run by CI on merge), plus a smoke test. Then iterate.
- **SLO vs SLA**: → [Core](../core-answers.md#slo)
- **Monday 9 a.m. alert**: → [Core](../core-answers.md#alerting)
- **Runbook worse than none**: when it's outdated or wrong (people trust it and make things worse), too long to use under pressure, or replaces fixing a recurring issue.
- **Four services, microservices?**: probably not yet. A well-modularised monolith or a few services with clear boundaries is simpler. Microservices pay off when team count and independent deploy needs grow. Decide by team structure and deploy coupling, not fashion.
- **When does adding a queue make a system slower?**: when it adds a hop and serialisation to a latency-sensitive synchronous path, when consumers are the bottleneck (the queue just grows latency), with retries or poison messages blocking ordered partitions, or when the request-reply pattern over a queue replaces a direct call. Queues smooth bursts and decouple, but don't increase processing capacity.
- **Postgres at 80% "capacity"**: clarify which. **CPU** (expensive queries or missing indexes: find top queries in `pg_stat_statements`, add indexes, tune, then scale up or add read replicas), **RAM** (shared_buffers and cache hit ratio dropping, so disk reads rise: tune memory, add RAM, fix queries reading too much), **disk** (storage filling: bloat from dead tuples, so vacuum or repack, archive or partition old data, grow storage, check WAL accumulation from stuck replication slots). Each needs a different fix.
- **Behavioural (rollback gone wrong, disagreement on a postmortem, saying "I don't know")**: → [Core](../core-answers.md#behavioural)
