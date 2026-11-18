---
tags:
  - interview
  - azure
---

# Infosys: Azure DevOps and DevOps/Cloud Infrastructure

Two saved posts: an Azure DevOps scenario interview and an initial screening for a DevOps/Cloud infrastructure role.

## Azure DevOps (scenario-based)

**A CI/CD pipeline takes about 45 minutes. How would you optimise it?** → [Core: pipeline speed](../core-answers.md#pipeline-speed). In Azure DevOps specifically: `Cache@2` for packages, parallel jobs and `strategy: matrix`, path filters in triggers, self-hosted or scale-set agents with warm caches, and Docker layer caching on persistent agents.

**Stages vs jobs in a multi-stage YAML pipeline?** A **stage** is a major division (Build, Test, Deploy-Dev, Deploy-Prod). Stages run sequentially by default (`dependsOn` to change that), and can carry approvals and checks through **environments**. A **job** is a unit of work that runs on **one agent**. Jobs in a stage run in parallel unless they declare `dependsOn`. A job contains **steps** (tasks or scripts). Deployment jobs add deployment strategies (runOnce, rolling, canary) and environment history.

**50 microservices on AKS, each repo with about 300 lines of similar build/test/deploy YAML. Make them reusable.** Put **YAML templates** in a central repo (stage, job and step templates with typed `parameters`), referenced through `resources: repositories` and `extends` or `template:`. Each service pipeline becomes ~20 lines passing parameters (service name, Dockerfile path, chart). Version the templates with tags and branches. `extends` templates can also enforce required security steps.

```yaml
resources:
  repositories:
    - repository: templates
      type: git
      name: Platform/pipeline-templates
      ref: refs/tags/v3
extends:
  template: microservice.yml@templates
  parameters:
    serviceName: orders
    chartPath: deploy/chart
```

**How would you achieve zero-downtime deployment?** → [Core: zero downtime](../core-answers.md#zero-downtime)

**The app works in Dev and QA but fails in Production.** Diff the environments: config and secrets (connection strings, feature flags, Key Vault references), network (private endpoints, NSGs, firewall, DNS, egress restrictions only in prod), identity (managed identity or RBAC missing in prod), data volume or shape, scale-related issues (concurrency, limits), different image or version, and TLS certificates. Read prod logs and Application Insights failures, and reproduce with prod-like config in staging.

**How would you handle database deployments through Azure DevOps?** Migrations as code (EF Core migrations, Flyway, Liquibase, or SQL DACPAC through `SqlAzureDacpacDeployment`), versioned in Git, run as a pipeline stage **before** the app deploy, backward compatible (expand and contract), with a backup or point-in-time restore point, approvals for prod, and generated scripts reviewed for drift. → [Airbnb migration answer](airbnb.md)

**Microsoft-hosted vs self-hosted agents: differences and when to choose each.** **Microsoft-hosted**: a fresh VM per job, no maintenance, standard images, but no persistent cache, limited specs, public IPs (can't reach private resources without extra setup), and minutes or parallel-job limits. **Self-hosted** (VMs, VM scale-set agents, or containers on AKS): reach private networks (private AKS, private endpoints), custom tools, bigger machines, warm caches, compliance needs, but you maintain and secure them. Use self-hosted when you need private network access or performance.

**Argo CD vs Kubernetes, and the deployment flow with Argo CD.** Kubernetes is the platform that runs workloads. **Argo CD** is a GitOps controller running *in* Kubernetes that continuously syncs manifests (Helm or Kustomize) from Git to clusters. Flow: CI builds and pushes the image to ACR → updates the image tag in the GitOps repo (PR) → Argo CD detects the change → renders and applies it → reports Synced/Healthy → self-heals drift. Rollback is reverting the commit.

**An AKS rollout shows successful, but the old image is still running.** → [Core: old version deployed](../core-answers.md#old-version-deployed)

**Your Docker image is about 3 GB. How would you reduce it?** → [Core: image size](../core-answers.md#image-size)

**A container is running but can't connect to SQL Server.** Test from inside the container (`nc -zv server 1433`, `nslookup`). Check DNS resolution (private endpoint DNS zone linked to the VNet), Azure SQL firewall rules or private endpoint, NSGs or NetworkPolicies, egress routes or firewall, the connection string (`server.database.windows.net,1433`, `Encrypt=true`), credentials or managed identity permissions in the database, and TLS or driver version.

**The app can't upload files to an Azure Storage Account. What would you validate?** Identity and RBAC (the managed identity needs **Storage Blob Data Contributor**, because control-plane Contributor isn't enough for data), SAS token expiry or permissions, account network rules (firewall or private endpoint only), DNS for the private endpoint, the container existing, key-based access turned off, TLS version, blob immutability or legal-hold policies, and size limits. Check the storage diagnostic logs for the exact error (403 AuthorizationPermissionMismatch against AuthorizationFailure from network rules).

**Application memory keeps increasing. How would you investigate and optimise?** Confirm the trend (working set over time and across restarts), tell a leak from cache growth (does it plateau?), take heap dumps or profiles (dotnet-dump, jmap, py-spy or memray) at two points and compare retained objects, check unbounded caches or collections, unclosed connections or streams, and event-handler leaks. Short-term: memory limits plus a restart policy. Long-term: fix the leak, add memory alerts. → [Core: OOMKilled](../core-answers.md#oomkilled)

**Secrets are hardcoded in YAML. How would you secure them?** Remove them and **rotate** them (they're compromised once committed), purge them from history, move them to Azure Key Vault, use variable groups linked to Key Vault or the `AzureKeyVault@2` task in pipelines, use the Secrets Store CSI driver plus workload identity in AKS, use service connections with workload identity federation instead of secrets, and add secret scanning (GitHub Advanced Security for Azure DevOps or gitleaks) to PRs.

**A developer commits to main. Explain the CI/CD flow until deployment.** → [Core: CI/CD](../core-answers.md#cicd-pipeline). Branch policies normally require a PR, so the commit arrives through a merge, which triggers CI, then CD stages with environment approvals.

## DevOps/Cloud infrastructure screening

**Tell me about yourself, your project, cloud experience, team size, number of servers (Windows/Linux), daily request volume, ticketing tool, internal or external app.** Prepare concrete numbers and keep them consistent: "a team of 8, about 300 Linux and 60 Windows servers across AWS and on-prem, 15–20 requests a day through ServiceNow, supporting an external customer-facing platform". Interviewers use these to judge how real your experience is.

**How do you patch Windows and Linux servers?** Define patch baselines and maintenance windows by environment (dev first, then prod), take snapshots or backups before patching, patch in waves with health checks, reboot coordination for clustered or load-balanced servers (drain one at a time), and report compliance. Tools: AWS Systems Manager Patch Manager, WSUS or SCCM/Intune for Windows, Ansible or yum/dnf-automatic for Linux.

**Have you used AWS Systems Manager for patching?** Yes: **Patch Manager** with patch baselines (approval rules, for example critical security updates auto-approved after 7 days), **patch groups** through tags, **Maintenance Windows** running `AWS-RunPatchBaseline` (Scan then Install) in rate-controlled batches with error thresholds, and **Patch compliance** reporting in SSM or Security Hub. Instances need the SSM agent and an instance profile with `AmazonSSMManagedInstanceCore`.
