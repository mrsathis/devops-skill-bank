---
tags:
  - interview
  - terraform
---

# Terraform questions (company not named)

## Fundamentals

**What is Terraform; how does it work; IaC; main features.** Terraform is a declarative IaC tool: you describe the desired infrastructure in HCL, `plan` compares config + state + real APIs and shows the diff, and `apply` makes the API calls through **providers** in dependency order (a resource graph or DAG, built from references, with independent resources created in parallel). Features: multi-cloud providers, plan before apply, state, modules, a registry, and workspaces. **Idempotency**: applying the same config again makes no changes, because it converges to the declared state.

**What is a provider? What is a plugin?** A provider is a plugin (a separate binary downloaded by `terraform init` from the registry) that implements resources and data sources for one API (AWS, Azure, Kubernetes, GitHub). Terraform Core talks to providers over gRPC, and the provider turns resource CRUD into API calls. Pin versions with `required_providers` and commit `.terraform.lock.hcl`.

**Terraform vs CloudFormation (and ARM).** Terraform is multi-cloud with HCL and a state file you manage, plus a large module ecosystem. CloudFormation is AWS-only, with state managed by AWS (stacks), drift detection, StackSets, and new AWS features on day one. → [AWS](../companies/aws.md), [J.P. Morgan](../companies/jp-morgan.md)

**Terraform vs Boto3: why choose Terraform for provisioning?** Boto3 is **imperative** scripting: you write the create, update, delete and error handling yourself, with no state or diff, and re-running can create duplicates. Terraform is **declarative** with state, plan, dependency ordering and idempotency, which makes it reviewable in PRs. Boto3 is better for operational automation (cleanup jobs, Lambda functions).

**Commands: init, validate, fmt, plan, apply, destroy; plan vs apply; terraform graph; debugging.** → [Core](../core-answers.md#tf-commands). `terraform graph | dot -Tsvg > graph.svg` renders the dependency graph. Debug with `TF_LOG=DEBUG TF_LOG_PATH=tf.log`, `terraform console` to evaluate expressions, `terraform validate`, and `-refresh=false` to isolate issues.

**What is the state file and why does it matter; when is it created; best place to store it; backends (local vs remote); which backends are best and why; DynamoDB locking; protecting state when many users run it.** → [Core: state](../core-answers.md#tf-state). Local backends are fine for experiments only. Remote backends (S3, azurerm, GCS, HCP Terraform) for teams.

**What is `terraform refresh`? What happens when you run it?** It updates the **state file** to match real infrastructure (reads every resource) **without changing infrastructure or config**. It's deprecated as a standalone command because it silently writes state. Use `terraform plan -refresh-only` to review and `apply -refresh-only` to accept. Plain `plan` and `apply` refresh automatically.

**If I create a second EKS cluster after writing Terraform for the first, will `terraform refresh` update the config for both?** **No.** Refresh only updates **state for resources already in state**. It never discovers new resources and never writes configuration. The second cluster (created outside this config) is unknown to Terraform until you write config for it and **import** it.

**The state file in remote is different from what's currently running. Can you update it?** Yes. Run `terraform plan -refresh-only` to see the differences and `apply -refresh-only` to update the state to match reality (if reality is correct), or `terraform apply` to push reality back to the code (if the code is correct). For structural mismatches, use `state mv`/`rm` and `import`. Never hand-edit state (if you must, `state pull`/`push` with backups and locking).

**State locking; two developers run apply at the same time and corrupt state.** → [Core: state](../core-answers.md#tf-state), [lost or corrupted state](../core-answers.md#tf-state-lost). With locking, the second apply simply fails with "Error acquiring the state lock".

**Drift: what it is; detection; handling manual changes; plan shows no changes but infra was modified.** → [Core](../core-answers.md#tf-drift). Plan always refreshes by default, so it *does* show drift on attributes Terraform manages. Changes to attributes not in your config, or to resources not in state, are invisible to it.

**`terraform import`: purpose, use, prerequisites before importing a VPC, passing arguments (IDs).** → [Core](../core-answers.md#tf-import). Prerequisites: a resource block (or import block) whose address matches, the right provider, region and account, and the resource's real ID (`vpc-…`). The syntax is `terraform import 'module.net.aws_vpc.this' vpc-0abc123` (quote addresses that have indexes, for example `'aws_subnet.private["a"]'`).

**I removed an EC2 entry from the state file. What happens on the next apply?** Terraform no longer knows the instance exists, so it plans to **create a new one**, while the old one keeps running unmanaged (an orphan, costing money). Fix it by re-importing the original, or deliberately use `state rm` when you want to stop managing something without destroying it.

**What happens if you delete a resource block from config?** The next apply **destroys** the real resource. To stop managing it without destroying it, use `terraform state rm` or a `removed { from = ... lifecycle { destroy = false } }` block (Terraform 1.7+). Protect critical resources with `prevent_destroy`.

**What happens if you rename a resource? Large refactors without downtime.** Terraform sees a destroy of the old address and a create of the new one. Use **`moved` blocks** (Terraform 1.1+, reviewable in code) or `terraform state mv` to map old to new addresses, then make sure `plan` shows no destroy. Split big refactors into small PRs.

**A resource fails halfway through apply; API rate limits during a big apply; exceeding service quotas.** → [Core: partial apply](../core-answers.md#tf-partial-apply). Rate limits: providers retry with back-off. Lower `-parallelism`, split the state, and set provider `max_retries`. Quotas: the apply fails at that resource, so request an increase (Service Quotas, which can itself be managed in Terraform) and re-apply. Check quotas before big rollouts.

**Losing access to the remote backend.** All operations fail (they can't read or lock state). Restore access (IAM, network, the backend service), never switch to local state as a workaround (split brain), and make sure the backend is highly available and backed up (S3 versioning, cross-region replication).

**Provider API changes between versions.** Pin provider versions (`~> 5.0`), read the upgrade guides, upgrade deliberately in a branch, run `plan` in all environments looking for unexpected replacements, use `moved` and state upgrades as documented, and roll out from dev to prod.

**Circular dependencies in modules.** Terraform fails with "Cycle: …". Break the cycle by restructuring: move the shared piece into its own resource or module, use separate rule resources (for example `aws_security_group_rule` / `aws_vpc_security_group_ingress_rule` instead of inline rules that reference each other), pass IDs through variables, or split into layers.

**Zero-downtime infrastructure updates.** `create_before_destroy`, blue-green resources (new ASG or launch template version with instance refresh), name prefixes to avoid name clashes during replacement, `prevent_destroy`, and managed services with failover. Always read the plan for `-/+` (replace).

**`depends_on`: when and why; make sure the VPC is created before the EC2 instance; a private route after the NAT gateway.** Terraform infers dependencies from **references** (an EC2 instance referencing `aws_subnet.x.id`, which references `aws_vpc.y.id`, is automatically ordered). Use `depends_on` only for **hidden** dependencies that references can't express: an IAM policy attachment that must exist before a Lambda runs, or an S3 bucket policy needed before a service uses the bucket. Example: `aws_route` with `nat_gateway_id = aws_nat_gateway.ngw.id` already depends on the NAT gateway through the reference. An instance whose user data needs internet access on boot might add `depends_on = [aws_route.private_nat]`.

**`count` vs `for_each`; loops; dynamic blocks.** → [Core](../core-answers.md#count-vs-foreach). Loops: `count`, `for_each`, and `for` expressions (`[for s in var.subnets : s.id]`). **Dynamic blocks** generate repeated nested blocks:

```hcl
resource "aws_security_group" "web" {
  name   = "web"
  vpc_id = var.vpc_id
  dynamic "ingress" {
    for_each = var.ingress_ports
    content {
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = ["10.0.0.0/8"]
    }
  }
}
```

**Modules: what, why, structure, custom modules, module vs template.** → [Core](../core-answers.md#tf-environments). Module layout: `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `README.md`, `examples/`. Write a **custom module** when public ones don't fit your standards (built-in tagging, encryption, naming) or to wrap several resources as one product. A *template* usually means `templatefile()` (rendering text such as user data or JSON policies with variables), which is not a reusable infrastructure unit like a module.

**Write a module to create an EC2 instance.**

```hcl
# modules/ec2/variables.tf
variable "name"          { type = string }
variable "ami_id"        { type = string }
variable "instance_type" {
  type    = string
  default = "t3.micro"
}
variable "subnet_id"     { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

# modules/ec2/main.tf
resource "aws_instance" "this" {
  ami           = var.ami_id
  instance_type = var.instance_type
  subnet_id     = var.subnet_id
  metadata_options { http_tokens = "required" }
  root_block_device { encrypted = true }
  tags = merge(var.tags, { Name = var.name })
}

# modules/ec2/outputs.tf
output "id"         { value = aws_instance.this.id }
output "private_ip" { value = aws_instance.this.private_ip }

# root usage
module "app" {
  source        = "./modules/ec2"
  name          = "app-1"
  ami_id        = data.aws_ami.al2023.id
  subnet_id     = module.vpc.private_subnets[0]
  instance_type = "t3.small"
}
```

**Terraform script to auto-scale EC2 instances.**

```hcl
resource "aws_launch_template" "app" {
  name_prefix   = "app-"
  image_id      = data.aws_ami.al2023.id
  instance_type = "t3.small"
  metadata_options { http_tokens = "required" }
}

resource "aws_autoscaling_group" "app" {
  name_prefix         = "app-"
  min_size            = 2
  max_size            = 10
  desired_capacity    = 2
  vpc_zone_identifier = var.private_subnet_ids
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB"
  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }
  instance_refresh { strategy = "Rolling" }
}

resource "aws_autoscaling_policy" "cpu" {
  name                   = "cpu-target-50"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification { predefined_metric_type = "ASGAverageCPUUtilization" }
    target_value = 50
  }
}
```

**Dynamically retrieve VPC details to create an EC2 instance.** Use **data sources**: `data "aws_vpc" "main" { tags = { Name = "prod" } }`, then `data "aws_subnets" "private" { filter { name = "vpc-id" values = [data.aws_vpc.main.id] } tags = { Tier = "private" } }`, then `subnet_id = data.aws_subnets.private.ids[0]`. Alternatively `terraform_remote_state` from the network stack, or SSM parameters published by it.

**Workspaces; managing different environments; where to store environment-specific variables.** → [Core](../core-answers.md#tf-environments). Environment variables live in `env/<env>.tfvars` (non-secret) in the repo, secrets come from the secret store or CI variables, and backend configuration lives in `env/<env>.backend.hcl`.

**Secrets / sensitive data in Terraform, including without Vault or a secrets manager.** → [Core](../core-answers.md#tf-secrets)

**Security best practices in Terraform.** Least-privilege deploy roles per environment through OIDC, encrypted and locked remote state with restricted access, no secrets in code, `sensitive` variables, scanning (Checkov, Trivy, tfsec), policy as code (OPA, Sentinel), pinned providers and modules from trusted sources, reviewed plans, and applies only from CI.

**Null resource; provisioners (local-exec, remote-exec).** `null_resource` (now superseded by the built-in **`terraform_data`**) is a resource that manages nothing in the cloud, used to run provisioners with `triggers` (or `triggers_replace`) that force a re-run when values change. Provisioners: **local-exec** runs a command on the machine running Terraform, **remote-exec** runs commands on the created resource over SSH or WinRM, and **file** copies files. HashiCorp recommends them only as a **last resort**: prefer user data, cloud-init, Packer images or config-management tools.

**`terraform taint`.** It marked a resource for forced replacement on the next apply. It's deprecated in favour of `terraform apply -replace="aws_instance.web"`, which shows the replacement in the plan before you approve it.

**`terraform fmt` / `validate` / `state mv` / the registry / HCP Terraform (Cloud) and Enterprise.** `fmt` rewrites files to canonical style (`-check` in CI). `validate` checks syntax and internal consistency without calling APIs. `state mv` moves or renames addresses in state (prefer `moved` blocks). The **Registry** (registry.terraform.io) hosts providers and modules with versions and docs. **HCP Terraform** (formerly Terraform Cloud) is HashiCorp's SaaS: remote runs and state, VCS-driven workflows, a private registry, Sentinel/OPA policies, cost estimation, team RBAC. **Terraform Enterprise** is the self-hosted version. (Terraform has been under the BSL licence since 1.6. **OpenTofu** is the open-source fork.)

**Large state (200 MB) and a 12-minute plan.** Split it into smaller states by component and blast radius (network, cluster, apps per team), use data sources or remote state between them, remove resources managed better elsewhere (Kubernetes objects through GitOps), avoid huge `for_each` over thousands of objects in one state, use `-refresh=false` only for quick checks, raise `-parallelism` within API limits, and keep providers current.

**Multiple Terraform modules across repos depend on each other and deployments fail due to dependency conflicts.** Version modules with **semantic versions** (Git tags or a private registry) and pin consumers, publish stable interfaces (outputs, SSM parameters) instead of reading each other's internals, define a deploy order across layers (network → platform → apps) in a pipeline orchestrator (Terragrunt `dependency` blocks, or pipeline stages), and test module upgrades in non-prod first.

**Terraform in your organisation; your role; why a custom module; where do you run Terraform (locally or remotely)?** Describe your setup honestly. A good mature answer: modules in a versioned repo, live configs per environment, runs only from CI (GitHub Actions, Jenkins or Atlantis) with OIDC, state in S3 with locking, plans reviewed in PRs. Running locally is only for development and read-only plans.

**Reduced deployment time using Terraform?** Example: provisioning a new environment went from days of tickets to 30 minutes through reusable modules plus a pipeline, and repeatable DR environments.

**"Federation user in Terraform".** Probably means federated identity. Terraform authenticates to AWS through **assumed roles from federated identities** (SSO/IAM Identity Center, `aws sso login` profiles locally, OIDC web-identity in CI using `assume_role_with_web_identity` in the provider) rather than IAM users with keys. Terraform can also *create* federation: `aws_iam_saml_provider` / `aws_iam_openid_connect_provider` plus roles with trust policies.

**An S3 bucket created by Terraform got a policy added manually. Handle it with IaC.** Detect it with `plan` (if the bucket policy is managed, Terraform shows it will remove the manual one). Decide: if the manual policy is needed, add it to code (`aws_s3_bucket_policy`) and apply. If it isn't, apply to remove it. If the policy resource isn't managed at all, Terraform won't notice, so bring it under management (import `aws_s3_bucket_policy`) and enforce through AWS Config rules and SCPs that only CI can change bucket policies.

**If an S3 bucket was created with Terraform, how would you destroy it?** `terraform destroy -target=aws_s3_bucket.x` (or remove it from code and apply). A non-empty bucket fails to delete unless `force_destroy = true` was set (which deletes all objects, including versions, so be careful in prod). Otherwise empty it first. Check `prevent_destroy` and Object Lock or retention.

**Unmanaged AWS resources in Terraform.** → [Core: import](../core-answers.md#tf-import)

**Provisioning MongoDB (Atlas) with Terraform.** Use the `mongodb/mongodbatlas` provider: `mongodbatlas_project`, `mongodbatlas_advanced_cluster`, database users, IP access lists or PrivateLink endpoints, with API keys from the secret store, the same as any other provider.

**A database whose migration version advanced by itself over a month: how to handle it?** (The question was garbled.) Treat it as drift between code and the real schema: compare the migration history table (Flyway `flyway_schema_history`, Liquibase `DATABASECHANGELOG`) with the repo, find who or what ran the migrations (an auto-migrate-on-start setting in the app), stop uncontrolled auto-migrations, reconcile the repo (add the missing migration scripts, or baseline at the current version), and make migrations a controlled pipeline step.

**Trigger an Ansible playbook on `terraform destroy`.** → [Think Future](../companies/think-future.md)

**How do you integrate Terraform with Jenkins? Plan/apply pipeline with approval.** → [Core](../core-answers.md#tf-pipeline)

```groovy
pipeline {
  agent { label 'terraform' }
  options { disableConcurrentBuilds() }
  stages {
    stage('Init')     { steps { sh 'terraform init -input=false' } }
    stage('Validate') { steps { sh 'terraform fmt -check && terraform validate' } }
    stage('Plan')     { steps { sh 'terraform plan -input=false -out=tfplan' } }
    stage('Approve')  { when { branch 'main' } steps { input message: 'Apply this plan?' } }
    stage('Apply')    { when { branch 'main' } steps { sh 'terraform apply -input=false tfplan' } }
  }
}
```

**Dynamic environment provisioning in CI/CD with Terraform.** Per-PR ephemeral environments: the pipeline runs `terraform apply` with a workspace or state key named after the PR (`pr-123`) and a small tfvars file, outputs the URL in the PR, and runs `terraform destroy` on merge or close (plus a TTL cleanup job for leftovers).

**Structure Terraform for a large project; reusable modules; the same modules across Dev, Stage and Prod; separate state per environment.** → [Core](../core-answers.md#tf-environments)

**Terraform CI/CD with validation, security checks and approval before Production.** → [Core](../core-answers.md#tf-pipeline)

**Lifecycle commands and state in team collaboration.** → [Core](../core-answers.md#tf-commands)

**Multi-AZ architecture with Terraform.** Use `for_each` over a map of AZ to CIDR for subnets, a NAT gateway per AZ, an ASG across all private subnets, RDS `multi_az = true`, and an ALB over public subnets in each AZ. Or the community `vpc` module with `azs`, `private_subnets`, `public_subnets`, `one_nat_gateway_per_az = true`.

**Explain the Terraform plan and its purpose.** `plan` refreshes state, compares it with config, and shows the exact actions (`+` create, `~` update in place, `-/+` replace, `-` destroy), why a replacement happens, and the output changes. Save it with `-out` so `apply` executes exactly what was reviewed. It's the safety and review step of IaC.

**Your advantages of AWS-native IaC vs Terraform (CloudFormation)?** → [AWS](../companies/aws.md)
