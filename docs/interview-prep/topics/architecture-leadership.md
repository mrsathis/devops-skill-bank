---
tags:
  - interview
  - architecture
---

# Architecture, platform and leadership questions (company not named)

These come from senior and staff-level question lists (cloud architect, platform engineer, senior DevOps/SRE). For scenario questions, interviewers want **structure, trade-offs and measurable outcomes**.

## Platform engineering

**Design a scalable internal developer platform (IDP) for 500+ engineers and hundreds of microservices.**

- **Developer portal** (Backstage): service catalogue with owners, docs, scorecards, and **software templates** for new services.
- **Runtime**: standardised Kubernetes clusters (multi-account and multi-region, GitOps with Argo CD), managed data services offered through self-service (Crossplane or Terraform modules behind a catalogue).
- **CI/CD**: reusable pipeline templates (build, test, scan, sign, deploy with progressive delivery).
- **Infrastructure provisioning**: versioned Terraform modules, policy as code.
- **Service discovery and networking**: mesh or Gateway API, DNS automation (ExternalDNS), certificates (cert-manager).
- **Secrets**: Vault or cloud secret managers with External Secrets, workload identity.
- **Observability**: OpenTelemetry by default, dashboards, SLOs and alerts generated per service.
- **Self-service with guardrails**, golden paths, docs, and a platform team operating it as a **product** (roadmap, SLAs, feedback, adoption metrics).

**A Kubernetes cluster has high CPU and intermittent pod failures: incident approach.** Declare and scope the incident (which nodes, namespaces, since when, any recent change?). Use metrics (node and pod CPU, throttling, restarts and reasons), logs and traces. Check resource limits (CPU throttling, OOM), autoscaling status (HPA at max, nodes Pending), node-level issues (noisy neighbours, kernel, disk pressure), and runaway workloads (a CronJob storm, a retry loop). Mitigate (scale nodes, limit or evict the offender, roll back), then fix and prevent (quotas, limits, priority classes, alerts). → [Core: incident response](../core-answers.md#incident-response)

**A secure IaC framework for many teams: modules, remote state, environments, policy as code, secrets, approvals, drift detection, reusable components.** → [Core: Terraform environments](../core-answers.md#tf-environments) and [pipeline](../core-answers.md#tf-pipeline). Add a module registry with semantic versions and tests (terratest, `terraform test`), OPA or Sentinel policies in the pipeline, per-team state isolation and roles, CODEOWNERS for review, and scheduled drift detection.

**A team wants direct production access because the platform slows them down.** Understand the real friction (slow pipeline, missing self-service, slow approvals). Fix the platform gap rather than granting broad access. Provide **just-in-time, audited, time-bound access** (break-glass with approval, PIM or Teleport), read-only access to logs and metrics, and self-service for common operations (restarts, scaling, feature flags) through safe tooling. Keep least privilege for writes. Measure and report the improvements.

**Build a self-service "golden path" for creating a new service.** One command or portal form → a repo from a template (app skeleton, Dockerfile, Helm chart or manifests, CI pipeline, tests) → registered in the catalogue with an owner → CI/CD wired with scanning and signing → namespace, RBAC and quotas created through GitOps → secrets path and workload identity provisioned → DNS and TLS automatic → default dashboards, SLOs and alerts → a production-readiness checklist (runbook, on-call) → first deploy to dev within minutes.

**A major platform migration (VMs to Kubernetes, or between clouds).** Inventory and **dependency mapping** (traffic flows, configs, data), categorise by complexity, pilot with low-risk services, build a migration factory (templates, runbooks, tooling), phases with parallel run (traffic shifting with weighted routing), data migration strategy, compatibility testing (kernel, networking, filesystem assumptions), a **rollback plan per wave**, success criteria, stakeholder communication and training, and decommission the old platform only after a soak period.

**A deployment introduced a subtle infrastructure change and caused an outage: prevent recurrence with platform engineering.** Automated validation (plan diffs reviewed, policy checks for risky changes such as security group widening or replacements), progressive delivery for infrastructure (canary environments or regions first), automated health checks and rollback, change risk scoring with higher scrutiny for high risk, drift detection, and blameless postmortems feeding new policies and tests.

**Golden path vs guardrails; "a platform teams use vs tolerate"; build vs buy.** → [Cloudflare Staff Platform](../companies/cloudflare.md)

## Cloud architecture

**A mission-critical platform across regions: scalability, HA, resilience, security, performance to strict SLAs.** → [Core: HA](../core-answers.md#aws-ha), [DR](../core-answers.md#dr-strategies), [Azure answer](azure.md). Structure: requirements (SLA, RTO/RPO, load, compliance) → architecture per layer (edge, compute, data, messaging) → resilience patterns → security → operations (IaC, observability, SLOs) → cost → how you'd test it (load, chaos, DR drills).

**Unpredictable spikes with latency and degradation: autoscaling, load balancing, caching, capacity management.** → [Azure answer](azure.md). Also: queue-based load levelling, predictive scaling, and capacity headroom policies.

**Near-zero downtime and minimal data loss during a regional outage.** → [Core: DR](../core-answers.md#dr-strategies)

**FinOps, cost governance, resource optimisation and consumption controls across accounts.** → [FinOps topic](finops.md), [Core: cost](../core-answers.md#cost-reduction)

**Teams provisioning independently with inconsistent security: governance, landing zones, IAM, policies, standards.** → [AWS landing zones](aws-cloud.md), [Azure landing zones](azure.md)

**Hybrid and multi-cloud networking, connectivity, segmentation and security.** → [Azure answer](azure.md), [AWS networking](aws-cloud.md#tgw-vs-peering)

**Modernising hundreds of legacy applications with rehost, replatform, refactor, repurchase or retire.** → [Migration](aws-cloud.md#migration)

**Zero Trust, identity governance, encryption, secrets, continuous security monitoring.** → [Azure answer](azure.md), [Core: AWS security](../core-answers.md#aws-security)

**DevSecOps, IaC, CI/CD, automated compliance, deployment strategies for faster releases.** → [Core: CI/CD](../core-answers.md#cicd-pipeline), [Siemens](../companies/siemens.md)

**Landing zone design (accounts, networking, IAM, guardrails, logging); security and compliance across accounts (CIS, policies, audits, data residency); network design at scale; secrets and encryption across services and regions; self-service with control; large-scale migrations; observability approach; CI/CD for infra and apps.** → [AWS topic](aws-cloud.md) (landing zone, Config and Security Hub, TGW), [Core](../core-answers.md). Data residency: region restriction SCPs or policies, data classification, and keys per region (KMS multi-region keys only where allowed).

**Describe a major cloud incident you owned (detection, RCA, fix, prevention); standards and platforms you've built as a senior leader.** Use STAR with numbers. → [Core: behavioural](../core-answers.md#behavioural)

**Microservices deployment architecture with Docker for HA and scalability.** → [Nvidia SRE](../companies/nvidia.md)

**Design a reliable system processing millions of URLs a day (crawl → process → store): infrastructure and DevOps decisions.**

- **Frontier queue** (SQS, Kafka) partitioned by domain for politeness (per-domain rate limits), dedupe (Bloom filter or Redis set of seen URL hashes).
- **Crawler workers**: stateless containers on Kubernetes or ECS autoscaled on queue depth (KEDA), Spot instances (work is retryable), with timeouts, retries with back-off, robots.txt caching, and egress through NAT with enough IPs (port exhaustion) or proxies.
- **Processing**: a separate stage reading raw pages from object storage (S3) through events, parsing and extracting, with a DLQ for failures.
- **Storage**: raw HTML in S3 (lifecycle to cheaper tiers), extracted data in a scalable store (DynamoDB, Cassandra or Elasticsearch), and metadata in Postgres.
- **Reliability**: idempotent processing keyed by URL hash, at-least-once semantics, checkpointing.
- **Observability**: throughput, error rates per domain, queue age, cost per 1,000 pages.
- **Scale math**: 10M URLs/day ≈ 116/s on average, plan for peaks of 3–5×.

## Transformation and leadership

<a id="transformation-roadmap"></a>

**You inherit a complex environment (fragmented architecture, legacy workloads, rising costs, weak governance): a multi-year transformation roadmap with measurable year-one results.**

1. **Assess (0–3 months)**: inventory, costs, risks, incidents, team skills. Interview stakeholders. Baseline metrics (cost, incidents, DORA, security score, SLOs).
2. **Stabilise and govern**: a landing zone and guardrails, identity cleanup, tagging and cost visibility, critical security fixes, basic observability on top services.
3. **Quick wins**: cost waste removal (often 15–30%), automation of the most frequent manual tasks, and fixing top repeat incidents.
4. **Platform**: golden paths, IaC and CI/CD standards, self-service.
5. **Modernise**: migrate and modernise applications in waves by value and risk.
6. **Optimise and scale**: FinOps maturity, SRE practices, and resilience.

Governance: an architecture board, a published roadmap, quarterly OKRs. **Year-one measures**: cost per unit down X%, secure score up, % of infrastructure as code, deployment frequency, MTTR down, P1 incidents down, % of services with SLOs, and developer satisfaction.

<a id="first-90-days"></a>

**Your first 90 days in an environment with manual deployments, drift, weak monitoring, frequent incidents, inconsistent IaC, poor docs, low maturity.**

- **Days 0–30 (listen and stabilise)**: shadow on-call and deployments, inventory systems and pain points, baseline the metrics (incidents, MTTR, deploy frequency, cost). Fix the top 2–3 sources of incidents, add basic monitoring and alerting for critical services, write runbooks for the most common pages, freeze manual prod changes without a ticket.
- **Days 31–60 (foundations)**: IaC for the most critical components (import, zero-diff plans), one standard CI/CD pipeline adopted by a pilot team, drift detection, SLOs for the top services, blameless postmortem process, a documentation home.
- **Days 61–90 (scale and show results)**: roll the pipeline and IaC patterns to more teams, alert tuning and on-call improvements, security baseline (secrets out of code, scanning), cost quick wins, and present results against the baseline with the next-quarter roadmap.

Throughout: build trust, communicate often, and pick visible wins.

**What would your first 30 days look like when told "automate everything by Q4"?** → [Nvidia round 4](../companies/nvidia.md)

**Balancing velocity with reliability, security and operational excellence; influencing an architectural decision; standards you built.** → [Core: behavioural](../core-answers.md#behavioural). Velocity and reliability aren't opposites: error budgets, automation and paved roads make the safe path the fast one.

**Senior DevOps/DevSecOps interviewer questions: an AWS key leaked (first hour); ECS or EKS, task role or IRSA; which compliance framework applies and how you'd detect a violation; what broke and what changed after.** Leaked key → [Core](../core-answers.md#leaked-key). Task role vs IRSA: both give scoped IAM roles to workloads. The **ECS task role** is set in the task definition, and **IRSA/Pod Identity** maps a Kubernetes ServiceAccount to an IAM role through OIDC or the Pod Identity agent. Same principle (no node-level credentials), different mechanism. Compliance: name it and two controls, for example **PCI DSS** (encrypt cardholder data at rest, Requirement 3; log and monitor all access, Requirement 10), detected by AWS Config rules (`encrypted-volumes`, `s3-bucket-server-side-encryption-enabled`) and Security Hub PCI standard findings, CloudTrail with alerts on log tampering. Or **SOC 2** (logical access controls, change management), detected through access reviews, IAM Access Analyzer and change records matched against deploy logs. What broke: a specific STAR story with detection, fix and the systemic change.

**What do you expect when interviewing a Solutions Architect? What does cloud computing mean to you; advantages; explain it to a CEO; challenges of moving.** → [AWS topic: CEO explanation](aws-cloud.md). An SA must explain the same concept at both technical and executive level, and back trade-offs with requirements.
