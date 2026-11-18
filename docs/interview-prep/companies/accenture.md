---
tags:
  - interview
---

# Accenture: DevOps Engineer

**How do you spend your day-to-day as a DevOps engineer?** Give a concrete picture: stand-up, then pipeline and deployment support, infrastructure changes through Terraform PRs, reviewing alerts and incidents, automation work (scripts, pipeline improvements), helping developers with environment and build issues, security fixes (image CVEs, patching), and documentation. Mention the tools and one recent example.

**What is a NAT Gateway? A practical use case.** A managed AWS service in a public subnet that lets instances in private subnets start outbound connections to the internet (OS updates, third-party APIs) while staying unreachable from outside. Example: private EKS nodes pulling images from Docker Hub or calling a payment API. → [Core: NAT gateway](../core-answers.md#nat-gateway)

**Prerequisites before upgrading a Kubernetes cluster?** → [Core: cluster upgrade](../core-answers.md#cluster-upgrade): deprecated API check, add-on compatibility, PDBs and replicas, backups, release notes, testing in non-prod, a rollback plan for the nodes.

**What is a Pod Disruption Budget?** → [Core: PDB](../core-answers.md#pdb)

**Shell script to calculate the factorial of a number.**

```bash
#!/usr/bin/env bash
n=${1:?usage: $0 <non-negative integer>}
[[ $n =~ ^[0-9]+$ ]] || { echo "not a number" >&2; exit 1; }
f=1
for ((i=2; i<=n; i++)); do f=$((f*i)); done
echo "$n! = $f"     # bash integers overflow after 20!; use bc for larger n
```

**Explain the VPC architecture in your project.** For example: one VPC per environment per account, `/16`, 3 AZs, each with a public subnet (ALB, NAT GW), a private app subnet (EKS nodes) and a private data subnet (RDS, ElastiCache). Route tables per tier, NAT per AZ, VPC endpoints for S3/ECR/SSM, Transit Gateway to shared services and on-prem, flow logs on. → [Core: VPC basics](../core-answers.md#vpc-basics)

**How is your CI/CD pipeline designed?** / **Design a basic CI/CD pipeline for a microservices app.** → [Core: CI/CD pipeline](../core-answers.md#cicd-pipeline). For microservices: a pipeline per service from a shared template, path-based triggers, an image per service tagged by SHA, and GitOps deployment per environment.

**Which security tools are integrated into your pipeline?** SonarQube (quality and SAST), Snyk or OWASP Dependency-Check (SCA), gitleaks (secrets), Trivy (image and IaC scan), Checkov or tfsec (Terraform), and optionally OWASP ZAP (DAST). Critical findings fail the build.

**How do you manage pipeline configuration and permissions?** Pipelines as code in Git (Jenkinsfile or YAML) with PR review, shared libraries or templates, credentials in the CI secret store scoped per folder or project or environment, RBAC (who can trigger prod), protected branches, environment approvals, and audit logs.

**What is a multi-stage Docker build and why use it?** → [Core: multi-stage](../core-answers.md#multi-stage)

**What are Kubernetes manifest files?** YAML or JSON declarations of desired state for Kubernetes objects. Each has `apiVersion`, `kind`, `metadata` (name, namespace, labels) and `spec`. You apply them with `kubectl apply -f`, and controllers reconcile the cluster to match.

**What is Ansible Vault?** A feature that encrypts sensitive data (variables files, strings) with AES-256 inside Ansible content so it can live in Git. Use `ansible-vault create|edit|encrypt|encrypt_string`, and run with `--ask-vault-pass` or `--vault-password-file` (or a vault ID from a secret store in CI).

**How do you build a highly available Kubernetes cluster?** 3+ control-plane nodes (or a managed control plane) across AZs, etcd with 3 or 5 members, a load balancer in front of the API servers, worker nodes across AZs with autoscaling, apps with multiple replicas, topology spread and PDBs, HA ingress and CoreDNS, etcd backups, and monitoring. → [Core: architecture](../core-answers.md#k8s-architecture)

**Which monitoring tools have you used?** Prometheus, Grafana and Alertmanager, CloudWatch, ELK or Loki for logs, Datadog, Dynatrace or New Relic, and OpenTelemetry for traces. Explain what you monitored and what alerted.

**Troubleshoot CrashLoopBackOff and ImagePullBackOff.** → [Core: CrashLoopBackOff](../core-answers.md#crashloopbackoff), [ImagePullBackOff](../core-answers.md#imagepullbackoff)

**Write or explain a Terraform script to create a VPC.**

```hcl
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "main" }
}
resource "aws_internet_gateway" "igw" { vpc_id = aws_vpc.main.id }

resource "aws_subnet" "public" {
  for_each                = { a = "10.0.1.0/24", b = "10.0.2.0/24" }
  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value
  availability_zone       = "eu-west-1${each.key}"
  map_public_ip_on_launch = true
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}
resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}
```

In real projects, use the `terraform-aws-modules/vpc/aws` module.

**How many objects can an S3 bucket store?** Unlimited. There's no limit on the number of objects or total bucket size. A single object can be up to 5 TB (a single PUT up to 5 GB, so use multipart upload above that).

**IAM roles vs IAM policies?** → [Core: IAM](../core-answers.md#iam)

**What are artefacts in CI/CD?** The versioned outputs of a build (JARs, container images, Helm charts, zip packages, test reports) stored in a repository (Nexus, Artifactory, ECR, S3) so the *same* artefact is promoted through environments, with traceability back to the commit.

**What are SAST and DAST?** **SAST** (static application security testing) scans source code or binaries without running them, early in CI (SonarQube, Semgrep, Checkmarx). **DAST** (dynamic) attacks the *running* app from outside for issues such as injection and misconfiguration (OWASP ZAP, Burp), usually against staging. Also SCA (dependencies) and IAST (instrumented runtime).

**Troubleshoot CI/CD pipeline failures.** Read the failing stage's log and exit code, reproduce it locally or on the same agent image, check what changed (code, dependencies, agent, credentials), check the agent's resources (disk, memory), rerun to rule out flakiness, and fix the cause rather than retrying. → [Core: sudden pipeline failure](../core-answers.md#pipeline-sudden-failure)

**What are Ansible roles?** A standard directory structure (`tasks/`, `handlers/`, `templates/`, `files/`, `vars/`, `defaults/`, `meta/`) that packages reusable automation for one purpose (for example `nginx`). Shared through Ansible Galaxy or Git, and parameterised through defaults.
