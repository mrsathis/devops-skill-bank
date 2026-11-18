---
tags:
  - interview
  - finops
---

# Cloud FinOps questions (company not named)

From a saved post about two technical rounds for a **Cloud FinOps Analyst** role, plus FinOps questions from other posts.

**Introduce yourself and your FinOps journey.** Tell it as a story with numbers: the scope you owned (cloud spend size, number of accounts and teams), the practices you built (tagging, showback, commitments, anomaly detection), and the impact (for example "cut run-rate by 28% while traffic grew 15%").

**Your previous organisation's cloud spend, and how your work affected it.** Give the order of magnitude and the levers you pulled: commitments coverage from X% to Y%, rightsizing savings, waste removal, storage tiering. Separate **realised** savings (on the invoice) from **avoided** costs.

**Tools for cost visibility, reporting and forecasting.** AWS Cost Explorer, **CUR 2.0 / Data Exports** queried with Athena, **CUDOS / CID dashboards** in QuickSight, AWS Budgets and Cost Anomaly Detection, Compute Optimizer, Trusted Advisor. Azure Cost Management, GCP Billing export to BigQuery. Third-party: CloudHealth, ProsperOps (automated commitment management), Vantage, Apptio Cloudability. Kubernetes: Kubecost or OpenCost. Forecasting: Cost Explorer forecasts plus business-driver models (cost per user × growth).

**Detecting usage anomalies or cost spikes; your approach to a sudden spike.** **Cost Anomaly Detection** monitors (per service, account, cost category or tag) with alert subscriptions, daily CUR dashboards with day-over-day deltas, budgets with forecast alerts. When there's a spike: identify the service, account and usage type in Cost Explorer (daily, grouped), drill into CUR line items (resource IDs), find the owner through tags, confirm whether it's expected (launch, campaign) or waste or error (runaway job, misconfigured autoscaling, logging explosion, data transfer, a compromised account), fix it, and add a guardrail. → [Core: cost spike](../core-answers.md#cost-reduction)

**A cost-saving recommendation arrives: act immediately or evaluate first? What decision criteria?** Evaluate first. Use a decision matrix: **usage trend** (is the low utilisation sustained over 2–4 weeks, including peaks?), **environment** (dev changes are low-risk, prod changes need owner sign-off and a change window), **business criticality and risk tolerance**, **effort and reversibility** (rightsizing is reversible, a 3-year commitment isn't), savings size, dependencies and planned changes (a migration next quarter makes a commitment unwise), and **performance headroom**. Low-risk, high-value, reversible items go first, approved by the owner.

**Reserved Instances vs Savings Plans: which is more flexible?** Both give discounts (up to ~72% for compute, depending on term and payment) for a 1- or 3-year commitment.

- **RIs** commit to specific instance attributes. *Standard* RIs give the highest discount, are limited flexibility (size flexibility within a family for regional Linux RIs), and can be sold on the marketplace. *Convertible* RIs can be exchanged. RIs also exist for **RDS, ElastiCache, OpenSearch and Redshift**, which Compute and EC2 Instance Savings Plans don't cover.
- **Savings Plans** commit to a **$/hour spend**. **Compute Savings Plans** are the **most flexible**: they apply across instance family, size, region, OS and tenancy, and also to **Fargate and Lambda**. **EC2 Instance Savings Plans** are tied to a family in a region, with a higher discount.

Use Compute Savings Plans for a broad, steady baseline, and RIs for databases and other services they cover.

**Optimising cost without RIs or Savings Plans.** Rightsizing, scheduling (non-prod off-hours), Spot, Graviton, autoscaling and scale-to-zero, removing idle and orphaned resources, storage tiering and lifecycle, gp2 → gp3, data transfer reduction (VPC endpoints, CloudFront, same-AZ traffic), log retention and sampling, serverless for spiky loads, and architectural changes (caching, queueing). → [Core](../core-answers.md#cost-reduction)

**EKS and containerisation cost savings: the steps.** Measure requests vs usage per namespace (Kubecost), right-size requests (VPA recommendations), **bin-pack** with Karpenter consolidation, mixed instance types including **Spot** for stateless workloads and **Graviton**, HPA to scale with demand plus scale-to-zero for dev (KEDA), cluster consolidation (fewer, larger shared clusters), remove idle workloads and environments, and allocate costs to teams with showback. → [Meesho](../companies/meesho.md)

**S3 storage tiers; Glacier usage and archival strategy.** → [S3 classes](aws-cloud.md#s3-classes)

**Tagging and untagged resources: did you enforce a tagging policy and how was compliance ensured?** A defined tag dictionary (`owner`, `team`, `cost-center`, `environment`, `application`), **AWS Organizations tag policies** (standardise keys and values), **SCPs** or IaC checks denying creation without required tags, Terraform `default_tags`, AWS Config `required-tags` rule with reports or auto-remediation, **cost allocation tags activated** in Billing, **Cost Categories** to map untaggable or shared costs, regular untagged-spend reports to owners with a target (for example < 5% untagged), and escalation.

**Showback vs chargeback.** **Showback** reports each team's costs to them (visibility, no billing). **Chargeback** actually bills the costs back to the team's or business unit's budget. Start with showback until the allocation data is trusted, then move to chargeback. Shared costs (support, networking, platform) are split by an agreed key.

**Have you used the CUDOS dashboard? Insights acted on?** CUDOS (part of the Cloud Intelligence Dashboards, built on CUR + Athena + QuickSight) shows spend by service, account and usage type, commitments coverage and utilisation, EC2 rightsizing and Graviton opportunities, data transfer breakdowns, EBS gp2-to-gp3, idle resources and S3 storage-class insights. Examples of actions: raised Savings Plans coverage after spotting on-demand creep, migrated gp2 volumes to gp3, found NAT data-transfer hotspots and added VPC endpoints.

**What goes into FinOps reporting and why it matters.** Total and per-team spend vs budget and forecast, trends and anomalies, **unit economics** (cost per customer, transaction or environment), commitments coverage and utilisation, savings realised vs opportunities pipeline, untagged or unallocated spend, and top movers. It matters because it creates **accountability** (owners see and own their costs), drives decisions (architecture, pricing, forecasting) and builds trust with finance.

**Multiple cloud accounts: managing cost visibility and control.** AWS Organizations with **consolidated billing**, a central FinOps or payer view (CUR at the management account), cost categories by business unit, account structure aligned with owners, budgets per account and OU, SCPs for guardrails (regions, instance families), and commitments shared across the org (or scoped through discount sharing settings).

**Automation built for FinOps.** Examples: scheduled stop/start of non-prod (Instance Scheduler), cleanup Lambdas for unattached EBS, old snapshots and idle load balancers (with notification and grace period), untagged-resource reports emailed to owners, anomaly alerts routed to team Slack channels, auto-deletion of expired ephemeral environments, gp2→gp3 conversion scripts, and commitment purchase recommendations pipelines.

**Staying up to date with services and pricing.** AWS What's New and pricing pages, the AWS Cost Management blog, FinOps Foundation (framework, certification, community), re:Invent sessions, vendor newsletters, and testing new features in a sandbox.
