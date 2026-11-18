---
tags:
  - interview
  - azure
---

# Siemens: DevOps Engineer (5+ years)

The panel focused on Azure DevOps, GitHub Actions and Terraform.

## CI/CD and pipelines

**Walk through a YAML pipeline you built for deploying Terraform code or a Function App.**

```yaml
trigger:
  branches: { include: [main] }
  paths: { include: [infra/*] }

stages:
  - stage: Plan
    jobs:
      - job: plan
        pool: { vmImage: ubuntu-latest }
        steps:
          - task: TerraformInstaller@1
            inputs: { terraformVersion: 1.9.5 }
          - task: AzureCLI@2            # service connection uses workload identity federation
            inputs:
              azureSubscription: sc-prod-wif
              scriptType: bash
              addSpnToEnvironment: true
              scriptLocation: inlineScript
              inlineScript: |
                export ARM_CLIENT_ID=$servicePrincipalId ARM_TENANT_ID=$tenantId
                export ARM_OIDC_TOKEN=$idToken ARM_USE_OIDC=true
                export ARM_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
                cd infra
                terraform init -backend-config=env/prod.backend.hcl
                terraform plan -out=tfplan -var-file=env/prod.tfvars
          - publish: infra/tfplan
            artifact: tfplan
  - stage: Apply
    dependsOn: Plan
    jobs:
      - deployment: apply
        environment: prod-infra          # approvals & checks configured on this environment
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: tfplan
                # same auth as above, then: terraform apply tfplan
```

For a Function App: build and test → `ArchiveFiles` → `AzureFunctionApp@2` deploying to a **staging slot** → smoke test → swap slots.

**Azure DevOps Pipelines vs GitHub Actions: pros and cons.**

| | Azure DevOps Pipelines | GitHub Actions |
|---|---|---|
| Strengths | Mature environments and approvals, deployment history, YAML templates with `extends`, tight Azure Boards and Repos integration, scale-set agents | Lives next to the code, huge marketplace, reusable workflows, OIDC built in, great for open source, GitHub Advanced Security |
| Weaknesses | Separate UI from GitHub, smaller ecosystem, Microsoft's investment is shifting towards GitHub | Environment and approval features need paid tiers for private repos, marketplace actions are a supply-chain risk (pin to SHAs) |

**Branching strategy, and triggering pipelines only on specific branch or path changes.** → [Core: branching](../core-answers.md#branching). Azure DevOps: `trigger: { branches: { include: [main, release/*] }, paths: { include: [src/api/*], exclude: [docs/*] } }`, and `pr:` for PR validation (or branch policies). GitHub Actions: `on: push: branches: [main] paths: ['src/api/**']`.

**Setting up a self-hosted agent or runner, and why you might need one.** Install the agent (`config.sh` with a PAT or registration token, run as a service), or better, autoscaling **VM scale-set agents** or **Actions Runner Controller** on Kubernetes for ephemeral runners. You need them for private network access (private endpoints, on-prem), custom tooling or bigger machines, caching, and compliance. Harden them: ephemeral, non-root, isolated per trust level, never used for untrusted fork PRs. → [Infosys answer](infosys.md)

## Security and secrets

**Managing secrets in pipelines (variable groups + Key Vault, GitHub Secrets/OIDC).** Azure DevOps: variable groups linked to **Key Vault** (secrets pulled at runtime, marked secret, masked in logs) or the `AzureKeyVault@2` task, with pipeline permissions scoped per group. GitHub: repository and environment secrets, environment protection rules, and OIDC for cloud access so no cloud secrets are stored. → [Core: pipeline secrets](../core-answers.md#cicd-secrets)

**Setting up OIDC / workload identity federation between GitHub Actions or Azure DevOps and Azure, so there are no long-lived credentials.**

1. Create an Entra ID app registration (or a user-assigned managed identity).
2. Add a **federated credential**: issuer `https://token.actions.githubusercontent.com`, subject `repo:org/repo:environment:prod` (scoped to an environment or branch), audience `api://AzureADTokenExchange`. For Azure DevOps, create an ARM service connection of type *Workload identity federation*, which sets this up automatically.
3. Give that identity least-privilege RBAC on the target scope.
4. In GitHub Actions: `permissions: id-token: write` and `azure/login@v2` with `client-id`, `tenant-id` and `subscription-id` (no secret). Terraform uses `ARM_USE_OIDC=true`.

The runner swaps its short-lived OIDC token for an Entra token on each run.

**Enforcing code quality and security scanning (tfsec, Checkov, linting).** Pipeline steps on every PR: `terraform fmt -check`, `validate`, `tflint`, and `checkov -d .` / `trivy config .` (tfsec is now merged into Trivy) with SARIF output published to the PR. Fail on high-severity findings, allow documented, time-limited suppressions, and make the stage a required check through branch policies.

## Terraform and IaC

**Terraform plan/apply pipeline with manual approval before apply.** → [Core: Terraform in CI/CD](../core-answers.md#tf-pipeline). In Azure DevOps the approval is an **Environment check**. In GitHub Actions, an **environment with required reviewers**. Always apply the saved plan artefact.

**Remote state and state locking in a team CI/CD environment.** The `azurerm` backend: a storage account with a container, a key per stack, **blob lease** locking (automatic), versioning and soft delete, private endpoint or firewall, RBAC with `use_azuread_auth = true` (no storage keys). → [Core: state](../core-answers.md#tf-state)

**Detecting and handling drift.** → [Core: drift](../core-answers.md#tf-drift). A scheduled pipeline running `terraform plan -detailed-exitcode` that alerts on exit code 2, plus Azure Policy and Activity Log alerts for manual changes.

## Deployment strategy and governance

**Approval gates and environments for production.** Azure DevOps **Environments** with checks: approvals, business hours, branch control (only `main` can deploy), Azure Monitor alert gates, required template, exclusive lock. GitHub: environments with required reviewers, wait timers and deployment branch rules.

**Rolling back a failed deployment.** → [Core: rollback](../core-answers.md#rollback). On Azure: App Service or Function **slot swap back**, redeploy the previous artefact (pipelines keep run history), `helm rollback` on AKS, revert the Terraform commit, and re-run.

**Pipelines across dev/staging/prod with promotion between environments.** Build once and publish the artefact, then stages per environment consuming the same artefact, with environment-specific variable groups and templates, gated by tests and approvals, and parameterised templates so every environment runs identical steps. → [Wipro #26](wipro.md)

## Bonus

**Alerts and notifications for pipeline failures (Teams, Slack, email).** Azure DevOps: project notification subscriptions (email), service hooks to Teams or Slack, or a final step `condition: failed()` posting to a webhook. GitHub Actions: `if: failure()` steps using Slack or Teams actions or webhooks. Route failures to the owning team's channel and include run links.

**Blue-green or canary deployment on Azure.** **App Service deployment slots** (deploy to staging, warm up, swap = blue-green, and **traffic routing %** to a slot = canary). AKS: Argo Rollouts or Flagger with NGINX, Application Gateway for Containers, or an Istio-based service mesh add-on for weighted routing. Front Door or Traffic Manager weighted routing across regions or stacks.
