---
tags:
  - interview
  - sre
---

# Mphasis: SRE & Observability Engineer

Two saved posts describe the same interview: one asks about Dynatrace, the other about Splunk. Both are answered below.

**Tell me about yourself; your tools and day-to-day as an SRE/observability engineer.** A 90-second summary: your scope (platforms, scale), your tools (Dynatrace or Splunk, Prometheus/Grafana, CloudWatch, PagerDuty), and your daily loop (review overnight alerts and SLOs, tune noisy alerts, build dashboards and monitors for new services, incident response, RCA follow-ups, automation). End with one measurable achievement.

**Explain the high-level architecture of Dynatrace.** **OneAgent** (installed on hosts or injected in Kubernetes through the Dynatrace Operator) automatically instruments processes, captures metrics, traces (PurePath), logs and RUM. **ActiveGate** is a proxy and routing component (for cloud API monitoring, private network routing and extensions). The **Dynatrace cluster** (SaaS or Managed) stores the data in **Grail** (the data lakehouse) and runs **Davis AI** for baselining, anomaly detection and root-cause correlation across the **Smartscape** topology. Query with **DQL**, visualise in dashboards and notebooks, and alert through problem notifications to ITSM or PagerDuty.

**Explain the architecture of Splunk.** **Forwarders** (the Universal Forwarder on hosts, or the Heavy Forwarder for parsing and routing) send data to **indexers**, which parse, index and store it in buckets (hot → warm → cold → frozen). Indexer clusters give replication (replication and search factors). **Search heads** (optionally clustered) run SPL searches across the indexers and host dashboards and alerts. A **deployment server** manages forwarder configs, and the **cluster manager** coordinates the indexer cluster. HEC (HTTP Event Collector) ingests from apps and cloud services.

**Configuring alerts for availability and latency: which metrics? How do you calculate failure rate and success rate?**

- **Availability**: request count, error count (5xx, plus business failures), success rate. **Latency**: percentiles (p50/p95/p99) of response time, not averages. Also throughput and saturation.
- `success_rate = successful_requests / total_valid_requests × 100`. `failure_rate = 100 − success_rate` (or `failed / total`). Exclude client errors (4xx) from failures unless they mean a server problem (for example 429 from our own throttling).
- Splunk example:

```spl
index=web sourcetype=access_combined
| stats count AS total, count(eval(status>=500)) AS failed, perc99(response_time) AS p99
| eval failure_rate=round(failed/total*100,2), success_rate=100-failure_rate
```

- Dynatrace: use the built-in service metrics `builtin:service.errors.total.rate` and `builtin:service.response.time` (percentiles) in a metric event or SLO definition, or DQL on spans. Alert on burn rate against the SLO, sustained over a window. → [Core: SLO](../core-answers.md#slo)

**Which cloud platforms and AWS load balancers have you worked with?** → [Core: ALB/NLB](../core-answers.md#alb-nlb-cloudfront). The Classic Load Balancer is legacy, so mention you'd migrate off it.

**Can an AWS load balancer route traffic directly to a different region? If not, how do you fail over across regions?** An ALB or NLB is **regional**: its targets are in its own region. (It *can* target IP addresses reachable over peering or TGW, including in another region, but that's not a failover pattern.) For cross-region routing or failover use **Route 53** (failover, latency or weighted records with health checks on each region's load balancer), **AWS Global Accelerator** (anycast static IPs with endpoint groups per region and automatic health-based failover), or **CloudFront** origin groups with origin failover.

**Difference between a VPC and a subnet?** → [Core: VPC](../core-answers.md#vpc-basics). A VPC is the regional network. Subnets are AZ-scoped ranges inside it.

**SSL certificates: installed or managed? What is one? What happens if it's missing or expired?** → [Core: TLS](../core-answers.md#tls)

**Your involvement in releases and production deployments.** Describe it: change tickets (CAB approvals), deployment runbooks, pre-checks and post-checks, monitoring during the release window, go/no-go decisions, rollback execution.

**Scenario: a SQL script must run in production, but the developer forgot to put it in the approved release steps. It was tested in lower environments and they verbally ask you to run it. Would you?**

**No, not on a verbal request.** Production changes must go through the approved change record. That's a control (often an audit or regulatory one, such as SOX or ISO 27001) that protects both you and the business. The right approach:

1. Stop and explain why.
2. Ask the developer to update the change (or raise an emergency or expedited change) with the script attached, the expected impact, and a rollback or backup plan.
3. Get approval from the change manager or release owner (a quick call if it's urgent).
4. Take a backup or snapshot, then run it with peer review (four-eyes), capturing the output.
5. Validate and record it in the change ticket.

If the release can't wait, escalate to the release manager, who decides whether to extend the window or release without it. Speed never justifies bypassing change control for a data change in production.

**Your Linux experience; maintenance, performance tuning and troubleshooting.** Patching and kernel updates, systemd services, LVM and filesystem extension, user and permission management, cron, log rotation, performance triage (`top`, `vmstat`, `iostat`, `sar`, `ss`), sysctl tuning (file descriptors, network buffers, `vm.swappiness`), and fixing full disks and stuck services. → [Core: high CPU](../core-answers.md#high-cpu), [disk full](../core-answers.md#disk-full)

**Have you automated anything recently? Which operational activities?** Give 2–3 examples with impact. For instance: automated certificate expiry checks and renewal, self-healing scripts that restart a hung service after collecting diagnostics, auto-generated monitors for new services from the service catalogue, log cleanup jobs, patch reporting. Quantify the hours saved and incidents avoided.
