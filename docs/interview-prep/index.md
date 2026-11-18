---
tags:
  - interview
---

# Interview prep

Real DevOps, Cloud, Kubernetes and SRE interview questions, collected from interview-experience posts I saved on LinkedIn, with the answers I'd give as a senior engineer.

- **101 posts** with interview questions, found in 1,406 saved posts (November 2026).
- About **1,500 questions** after removing exact duplicates. Near-duplicates are merged.
- Questions asked at **many** companies (CrashLoopBackOff, Terraform state, probes, NAT gateways…) are answered once in **[Core answers](core-answers.md)** and linked from everywhere else.

!!! note "How these answers are written"
    Each answer explains the mechanism first, then the order you'd investigate in, then the fix and how to prevent it. Commands and code are working examples. Facts that change over time (service limits, versions) were current when this was written, so check the official docs before relying on a number.

## By company

| Company | Role | Focus |
|---|---|---|
| [Accenture](companies/accenture.md) | DevOps Engineer | AWS, Kubernetes, CI/CD, Terraform, Ansible |
| [Airbnb](companies/airbnb.md) | Senior DevOps Engineer | Marketplace scale, DB migrations, multi-tenancy, RCA |
| [Amazon](companies/amazon.md) | Senior DevOps Engineer | Flash-sale scale, Istio canary, Kafka/Redis RCA |
| [AWS](companies/aws.md) | DevOps | EKS platform, GitOps, multi-account Terraform, system design |
| [Atlassian](companies/atlassian.md) | DevOps Architect | Multi-tenant EKS, Kustomize, AMIs, Linux forensics |
| [Barclays](companies/barclays.md) | DevOps Engineer | Production troubleshooting scenarios |
| [Big 4 (not named)](companies/big4-aws-devops.md) | AWS DevOps | EKS, IRSA, IAM, NAT, Terraform |
| [Cloudflare](companies/cloudflare.md) | Senior SRE, Staff Platform Engineer | Anycast, safe global rollouts, BGP, DDoS, platform design |
| [Deloitte](companies/deloitte.md) | DevOps Engineer | Jenkins, shared libraries, Helm, EKS auth, image scanning |
| [HashedIn by Deloitte](companies/hashedin-deloitte.md) | DevOps Engineer | Operators/CRDs, networking, Docker, AWS, Terraform |
| [HCLTech](companies/hcltech.md) | DevOps Engineer | Kubernetes internals, CNI/IPs, Boto3, RDS, Route 53 |
| [Infosys](companies/infosys.md) | Azure DevOps, Cloud Infra | Pipeline templates, AKS, ACR, patching |
| [J.P. Morgan](companies/jp-morgan.md) | DevOps / Cloud | Fundamentals, service mesh, runbooks, HR round |
| [JioHotstar](companies/jiohotstar.md) | Senior DevOps Engineer | Streaming scale, pre-warming, Kafka/Redis RCA |
| [LinkedIn](companies/linkedin.md) | Senior SRE | Feed design, Kafka pipelines, canary analysis, SLO culture |
| [Meesho](companies/meesho.md) | Senior DevOps Engineer | Cutting cloud cost by 40% without hurting reliability |
| [Mphasis](companies/mphasis.md) | SRE & Observability | Dynatrace, Splunk, change control, TLS |
| [Netflix](companies/netflix.md) | DevOps Lead | Istio at scale, eBPF/Cilium, mTLS RCA, chaos |
| [Nvidia](companies/nvidia.md) | Senior DevOps (GPU infra), SRE | Bare metal, NUMA, GPU, kernel patching, EKS |
| [Paytm](companies/paytm.md) | DevOps Engineer | AWS, Ansible, Jenkins, CloudFront, Python |
| [Siemens](companies/siemens.md) | DevOps Engineer | Azure DevOps, GitHub Actions, OIDC, Terraform |
| [Tesla](companies/tesla.md) | DevOps Engineer, SRE/DevOps | Edge CI/CD, Cilium, fleet-scale design, OTA |
| [Think Future Technologies](companies/think-future.md) | DevOps Engineer | Terraform, user data, Docker live scenario |
| [Uber](companies/uber.md) | Senior DevOps Engineer | Multi-region dispatch, capacity planning, RCA |
| [Wipro](companies/wipro.md) | DevOps Engineer (5–8 yrs) | Linux, Docker, Kubernetes, CI/CD, cloud, Terraform |

## Company not named: by topic

About two thirds of the posts didn't name the company. Those questions are grouped by topic:

| Topic | Page |
|---|---|
| Kubernetes, Helm, Istio | [Kubernetes](topics/kubernetes.md) |
| Docker and containers | [Docker](topics/docker.md) |
| Terraform | [Terraform](topics/terraform.md) |
| CI/CD, Jenkins, Git | [CI/CD and Git](topics/cicd-git.md) |
| AWS and cloud | [AWS and cloud](topics/aws-cloud.md) |
| Azure architecture | [Azure](topics/azure.md) |
| Linux, networking, scripting, SQL | [Linux and networking](topics/linux-networking.md) |
| SRE, observability, incidents | [SRE and observability](topics/sre-observability.md) |
| Architecture, platform, leadership | [Architecture and leadership](topics/architecture-leadership.md) |
| Cloud FinOps | [FinOps](topics/finops.md) |
| DevOps basics, projects, coding | [General](topics/general-devops.md) |

## How to practise

1. Pick a company page and answer out loud *before* reading the answer.
2. For scenario questions, say the steps in order: scope → what changed → check layer by layer → mitigate → root cause → prevent.
3. Turn 6–8 of your own real incidents into STAR stories (see [behavioural](core-answers.md#behavioural)), because almost every company asks for them.
