---
tags:
  - interview
  - aws
---

# Big 4 (firm not named): AWS + DevOps first round

**How many EKS clusters do you use in your project?** Be specific and explain *why*. For example: "Four: dev, staging and prod per region (two prod regions), separate accounts per environment for blast radius and IAM isolation, shared non-prod tooling. Within clusters, namespaces per team."

**How do you switch from one EKS cluster to another?**

```bash
aws eks update-kubeconfig --region eu-west-1 --name prod-cluster --alias prod   # adds context
kubectl config get-contexts
kubectl config use-context prod
```

Tools such as `kubectx`/`kubens` help, and show the context in your prompt so you don't run commands against prod by mistake.

**What is a ServiceAccount, and how do you let it talk to AWS CloudWatch?** A ServiceAccount is the identity pods use to talk to the Kubernetes API (with its own RBAC). For AWS access, use **IRSA**: the cluster has an **OIDC provider** registered in IAM, you create an IAM role with a trust policy allowing `sts:AssumeRoleWithWebIdentity` for `system:serviceaccount:<ns>:<sa>`, attach a CloudWatch policy (for example `CloudWatchAgentServerPolicy`), and annotate the SA with `eks.amazonaws.com/role-arn`. The SDK in the pod picks up the projected token. The newer option is **EKS Pod Identity** (an association between the SA and the role, no OIDC annotation).

**How would you give a new employee server access? Would you share the PEM file?** **Never share the PEM.** Each person needs individual, auditable, revocable access. Best: **SSM Session Manager**: grant their SSO role `ssm:StartSession` on tagged instances, with no SSH port and sessions logged. Alternatives: EC2 Instance Connect (short-lived keys pushed through IAM), or create an OS user with *their* public key, managed through config management, and remove it on offboarding.

**Given an IAM role ARN, how do you find who uses it and which policies are attached?**

```bash
aws iam list-attached-role-policies --role-name MyRole      # managed policies
aws iam list-role-policies --role-name MyRole               # inline policies
aws iam get-role --role-name MyRole --query 'Role.AssumeRolePolicyDocument'   # who CAN assume it
```

To see who *actually* uses it: CloudTrail `AssumeRole` events where the resource is the role (Lake or Athena query), plus `RoleLastUsed` from `get-role`, and IAM **Access Advisor** (`generate-service-last-accessed-details`) for which services it touched. IAM Access Analyzer can generate least-privilege policies from that activity.

**ECS vs EKS: why pick one over the other?** **ECS** is AWS-native, simpler, with no control-plane fee and deep integration (IAM task roles, ALB, Cloud Map). It's good for teams that want containers without Kubernetes complexity. **EKS** brings the Kubernetes ecosystem (Helm, operators, service mesh, GitOps), portability across clouds and on-prem, and existing Kubernetes skills, at the cost of more complexity. Both can run on Fargate. You'd regret ECS if you later need Kubernetes-only tooling or multi-cloud. You'd regret EKS if a small team ends up spending its time on cluster operations.

**Log in to a server and check disk usage.** `ssh user@host` or an SSM session, then `df -h` (filesystems), `df -i` (inodes), `du -xh / --max-depth=1 | sort -h` to find the biggest directories, and `lsof +L1` for deleted-but-open files. → [Core: disk full](../core-answers.md#disk-full)

**The app is in a private subnet and must call a third-party weather API. What's required, and how does the data flow back?** → [Core: NAT gateway](../core-answers.md#nat-gateway)

**Write Terraform to create an EC2 instance and an S3 bucket.**

```hcl
terraform {
  required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } }
}
provider "aws" {
  region = "eu-west-1"
  default_tags { tags = { Project = "demo", Environment = "dev" } }
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.al2023.id
  instance_type = "t3.micro"
  subnet_id     = var.subnet_id
  metadata_options { http_tokens = "required" }   # IMDSv2
  tags = { Name = "web-1" }
}

resource "aws_s3_bucket" "data" {
  bucket = "demo-data-${data.aws_caller_identity.me.account_id}"
}
resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
data "aws_caller_identity" "me" {}
variable "subnet_id" { type = string }
```

**What is Minikube?** A tool that runs a **single-node Kubernetes cluster locally** (in a VM, a container or bare metal) for development, learning and testing. It isn't for production. Alternatives: kind (Kubernetes in Docker), k3d, Docker Desktop Kubernetes.
