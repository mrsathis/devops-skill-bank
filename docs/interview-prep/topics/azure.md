---
tags:
  - interview
  - azure
---

# Azure architecture questions (company not named)

These come from several "senior Azure architect / leader" question lists. They're scenario questions, so each answer gives the structure a strong senior answer should follow.

**Design a secure, scalable, highly available Azure architecture for a mission-critical app with strict uptime and performance requirements.**

- **Edge**: Azure Front Door (global L7, WAF, CDN, health-based failover between regions) or Traffic Manager for DNS-level routing.
- **Regional**: Application Gateway (WAF v2) or Application Gateway for Containers → AKS (availability zones, autoscaler, several node pools) or App Service Premium (zone-redundant) → Azure SQL (Business Critical, zone-redundant, auto-failover groups) or Cosmos DB (multi-region writes), Azure Cache for Redis (zone-redundant), Storage ZRS or GZRS.
- **Security**: hub-spoke VNets with Azure Firewall, private endpoints for PaaS, Entra ID with managed identities, Key Vault, Defender for Cloud.
- **Operations**: everything as Bicep or Terraform, Azure Monitor and Application Insights with SLO-based alerts, availability SLA arithmetic (composite SLA) to justify the multi-region choice.

**Unpredictable traffic spikes and performance degradation: autoscaling, load balancing, caching, and finding the bottleneck with Azure Monitor and Application Insights.**

- **Diagnose**: Application Insights application map and end-to-end transaction traces (slow dependency calls), Performance blade (slowest operations), live metrics, and Azure Monitor metrics for App Service, AKS or VMSS (CPU, memory, HTTP queue length), SQL Query Performance Insight and DTU/vCore saturation, Redis server load. KQL queries over requests and dependencies by percentile.
- **Fix**: autoscale rules (VMSS or App Service autoscale on CPU, queue length or schedule, KEDA on AKS), cache-aside with Redis and Front Door caching, async processing with Service Bus, read replicas or Hyperscale, connection pooling, and load testing with Azure Load Testing.

**Multi-region business continuity: HA, DR, failover and RPO/RTO on Azure.**

- Pick a pattern per tier from the RTO/RPO: active-active (Front Door + stateless apps in two regions + Cosmos DB multi-region or SQL auto-failover groups) or active-passive (Azure Site Recovery for VMs, GZRS/RA-GZRS storage, geo-restore or failover groups for databases).
- Use **paired regions** for sequential platform updates and geo-redundant storage.
- Infrastructure as code so the secondary can be built, Key Vault and secrets in both regions, and **regular failover drills** (planned failover tests of failover groups and ASR test failovers) with measured RTO/RPO. → [Core: DR](../core-answers.md#dr-strategies)

**Azure spend has grown across subscriptions and business units: FinOps, governance, optimisation and reserved capacity.**

- **Visibility**: Cost Management + Billing (cost analysis by subscription, resource group and **tags**), budgets with alerts, exports to storage plus Power BI or FinOps toolkit, anomaly alerts.
- **Governance**: Azure Policy for required tags, allowed SKUs and regions, management-group budgets, showback and chargeback.
- **Optimisation**: Azure Advisor recommendations, right-size VMs and App Service plans, auto-shutdown and scale-to-zero for dev, **Reservations and Savings Plans** for steady compute, Spot VMs for batch, **Azure Hybrid Benefit** for Windows and SQL licences, storage tiering (hot/cool/cold/archive lifecycle), deleting orphaned disks, IPs and snapshots, serverless SQL and auto-pause. → [Core: cost](../core-answers.md#cost-reduction)

**Teams provision resources independently with inconsistent security: landing zones, management groups, Azure Policy, RBAC and standards.**

Adopt the **Azure landing zone** (Cloud Adoption Framework) architecture:

- A **management group** hierarchy (Platform: identity, management, connectivity; Landing Zones: corp, online; Sandbox; Decommissioned).
- **Subscription vending** (automated, with guardrails) for each workload.
- **Azure Policy** initiatives assigned at management-group level (deny public IPs in corp, require private endpoints, enforce tags, diagnostic settings deployed automatically through DeployIfNotExists, allowed regions).
- RBAC with Entra ID groups and PIM for just-in-time privileged access, central Log Analytics.
- Deploy it with the ALZ Bicep or Terraform modules and manage it as code.

**Secure connectivity between on-prem, Azure and SaaS: hybrid networking, ExpressRoute, VPN, DNS, segmentation and security.**

- **Hub-spoke** (or Virtual WAN for large global estates): the hub hosts Azure Firewall, ExpressRoute and VPN gateways (VPN as ExpressRoute backup), and Bastion. Spokes peer to the hub. UDRs force traffic through the firewall.
- **ExpressRoute** for private, predictable connectivity (with Global Reach between sites if needed). Site-to-site VPN for branches or backup.
- **DNS**: Azure **Private DNS zones** for private endpoints, **DNS Private Resolver** for hybrid resolution (inbound and outbound endpoints with conditional forwarders both ways).
- Segmentation with NSGs and ASGs, Azure Firewall Premium (TLS inspection, IDPS), private endpoints for PaaS, Entra Private Access or ZTNA for users, and DDoS Protection.

**Modernising hundreds of legacy apps: the 6R or 7R strategy and modernisation approach; AKS vs App Service vs Functions.** Assess with **Azure Migrate** (discovery, dependency analysis, readiness and cost). Classify each app by business value and technical fit, then choose **Rehost** (Azure VMs or ASR), **Replatform** (App Service, Azure SQL MI), **Refactor** (containers on AKS or Container Apps, Functions), **Repurchase** (SaaS), **Retire** or **Retain**. Wave planning by dependencies, and pilot first. Platform choice: **App Service** for standard web apps and APIs (lowest operational overhead), **Container Apps** for containerised microservices without managing Kubernetes, **AKS** when you need full Kubernetes control and ecosystem, **Functions** for event-driven pieces. → [Topic: migration](aws-cloud.md#migration)

**Excessive privileges, exposed resources, weak identity: Zero Trust with Entra ID, RBAC, Key Vault, Defender for Cloud.**

- **Identity**: Entra ID with MFA and **Conditional Access** (device compliance, location, risk), **PIM** for just-in-time admin roles, access reviews, remove standing Owner and Contributor, **managed identities** instead of secrets, workload identity federation for CI/CD.
- **Least-privilege RBAC** at the narrowest scope.
- **Secrets**: Key Vault with RBAC, private endpoint, purge protection, rotation.
- **Exposure**: private endpoints, deny public network access by policy, WAF.
- **Monitoring**: **Defender for Cloud** (secure score, CSPM, Defender plans for servers, containers, SQL and storage) and **Microsoft Sentinel** (SIEM) with automated playbooks.

**Faster releases across environments without compromising governance: DevSecOps, IaC, CI/CD, automated compliance and deployment strategies.** Azure DevOps or GitHub with templates (`extends`) enforcing required security stages, Bicep or Terraform with what-if or plan review, Azure Policy as code, environments with approvals and checks, OIDC (workload identity federation), scanning (code, dependencies, containers, IaC), progressive deployment (slots, canary on AKS), and DORA metrics. → [Siemens](../companies/siemens.md)

**You inherit a complex Azure estate (legacy, inconsistent governance, rising costs, operational issues): create a multi-year roadmap and show improvement in year one.** → [Architecture topic: transformation roadmap](architecture-leadership.md#transformation-roadmap)

**Integrating ACR with Azure Pipelines to build, push and deploy container images.** Create an ACR and a **Docker Registry service connection** (workload identity federation or managed identity). In the pipeline: `Docker@2` with `command: buildAndPush`, `containerRegistry: <connection>`, `repository: app`, `tags: $(Build.SourceVersion)`. Scan the image (Trivy or Defender for Containers), then deploy with `KubernetesManifest@1` (AKS, with `imagePullSecrets` or better, **AKS attached to ACR** through `az aks update --attach-acr` so the kubelet identity has AcrPull) or `AzureWebAppContainer@1`, environment-specific stages with approvals.

**Ensuring security throughout Azure Pipelines from build to deploy.** Secure code practices and branch policies, secret scanning, SAST and SCA, container image scanning, **service connections with least privilege** (scoped to a resource group, workload identity federation), protected resources (approvals and checks on service connections, agent pools, environments), pipeline permissions locked down, self-hosted agents hardened and ephemeral, `extends` templates enforcing required steps, audit logs, and regular reviews.
