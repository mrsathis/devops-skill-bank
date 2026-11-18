---
tags:
  - interview
  - aws
---

# AWS: DevOps

## Round 1: AWS infrastructure, Kubernetes and IaC

**Design a highly available, multi-AZ EKS platform for millions of concurrent users. Which services and why?**

- **Edge**: Route 53, CloudFront and WAF/Shield for DDoS protection, caching and global edge TLS.
- **Entry**: ALB through the AWS Load Balancer Controller (Ingress or Gateway API), in IP mode targeting pods directly.
- **EKS** across 3 AZs, managed control plane, Karpenter for nodes (mixed On-Demand/Spot, Graviton), HPA/KEDA for pods, topology spread, PDBs.
- **Networking**: VPC CNI with prefix delegation (pod density) in large private subnets, NAT per AZ, VPC endpoints.
- **Data**: Aurora (Multi-AZ, read replicas), DynamoDB for high-scale key-value, ElastiCache Redis Multi-AZ, S3.
- **Security**: IRSA or EKS Pod Identity, Secrets Manager plus External Secrets, KMS.
- **Observability**: CloudWatch Container Insights / AMP + AMG, X-Ray/ADOT. GitOps with Argo CD, and IaC with Terraform.

**Explain your GitOps workflow on EKS. Deploying infrastructure and apps safely with Terraform and Argo CD/Flux.** → [Tesla GitOps answer](tesla.md). Terraform builds the account, VPC, EKS and the Argo CD bootstrap. Argo CD manages add-ons and apps from Git, with PR-based promotion.

**Manage Terraform state across multiple AWS accounts and regions with S3, DynamoDB locking and CI/CD.**

- A central state bucket in a tooling or shared-services account (versioning, SSE-KMS, Block Public Access, a bucket policy restricted to CI roles), or one bucket per account.
- One state key per account, region and component (`prod/eu-west-1/eks/terraform.tfstate`).
- Locking: a DynamoDB table (classic) or the S3 native lockfile in Terraform 1.10+.
- CI assumes a per-account deploy role through OIDC, and the provider uses `assume_role` into the target account.
- Cross-stack values come from `terraform_remote_state` or SSM parameters. → [Core: state](../core-answers.md#tf-state)

**Secure an EKS cluster using IAM, IRSA, VPC networking, security groups and Secrets Manager.**

- Private API endpoint (or restricted CIDRs).
- Access entries or `aws-auth` mapped to SSO roles, with least-privilege RBAC.
- **IRSA or Pod Identity** so pods get scoped IAM roles (no node-role sharing).
- Block the instance metadata service from pods (IMDSv2 with hop limit 1).
- Security groups for pods where needed, NetworkPolicies.
- Secrets in Secrets Manager synced with External Secrets or the CSI driver, with KMS envelope encryption of Kubernetes secrets.
- Image scanning in ECR, Pod Security Admission, GuardDuty EKS protection, control-plane audit logs. → [Core: Kubernetes security](../core-answers.md#k8s-security)

**Automate provisioning with Terraform, CloudFormation and AWS-native services. When would you choose which?**

**Terraform** for multi-account and multi-cloud, a large module ecosystem, and teams already using it. **CloudFormation/CDK** when you need AWS-native integration: StackSets across an organisation, Service Catalog, Control Tower customisations, marketplace requirements, day-one support for new services, or no state file to manage. **AWS-native services** such as Systems Manager, Control Tower account factory and Config remediation for operational automation. Pick one standard per layer and stay consistent.

**Capacity planning and autoscaling with ASGs, Karpenter, Cluster Autoscaler and Spot.** → [Core: node autoscaling](../core-answers.md#node-autoscaling). Forecast the baseline and cover it with Savings Plans, handle bursts with Karpenter using diverse instance types, use Spot for stateless work with interruption handling, ASG scaling policies (target tracking, predictive scaling) for EC2 tiers, and quotas checked ahead of time.

## Round 2: Incident response and reliability

**Customers suddenly can't reach an application on AWS. Troubleshoot from Route 53 to the application.**

1. **DNS**: `dig` the name. Correct record? Route 53 health checks failing over to a wrong or empty target? Domain or delegation expired?
2. **CloudFront/WAF** (if used): 4xx/5xx at the edge, a WAF rule blocking, an origin error.
3. **ALB**: healthy target count, `HTTPCode_ELB_5XX` against target 5xx, listener and certificate, security group allowing 443 from the internet.
4. **Targets**: health-check failures, security group from the ALB, NACLs.
5. **App**: logs, recent deploy, dependencies (database, secrets).
6. **AWS Health Dashboard** for a regional event.

Mitigate (roll back, fail over), then investigate.

**API latency on EKS doubles while worker nodes stay healthy. Investigate with CloudWatch, X-Ray, Prometheus and Grafana.** X-Ray traces to find the slow span, then per-route metrics in Prometheus (by version, pod, AZ), then dependency metrics (RDS Performance Insights, ElastiCache latency), CPU throttling, DNS and CoreDNS latency, network (cross-AZ). → [Core: latency](../core-answers.md#latency-normal-resources)

**A deployment succeeds but only some users see failures. Infrastructure, networking, Kubernetes or application?** Find what the failing users share: version (only requests hitting new pods, so a canary or mixed rollout points to the app), AZ or node (infrastructure), region or ISP (network), feature flag or tenant (app config). Use load balancer logs (target IP per request) and traces to tie failures to specific pods.

**CloudWatch alarms show elevated error rates but dashboards don't show the root cause. What other tools and techniques?** CloudWatch Logs Insights queries over app and ALB access logs, X-Ray service map and traces, Contributor Insights (top error sources), CloudTrail for API changes, AWS Config timeline for resource changes, RDS Performance Insights, VPC Flow Logs, and deployment history. Correlate by time.

**A Terraform deployment fails midway, leaving resources partially provisioned.** → [Core: partial apply](../core-answers.md#tf-partial-apply)

**Pods on EKS continuously restart after deployment, but readiness and liveness probes are healthy.** → [Tesla answer](tesla.md): OOMKilled, the app exiting by itself, a sidecar crash, evictions. Check `kubectl describe` for the last state.

**Run a postmortem after a large AWS production outage. What would you focus on?** → [Core: postmortems](../core-answers.md#postmortem). Include metrics (impact minutes, error-budget burn, MTTD/MTTR), what alerting caught or missed, and dependencies on single AZs or regions.

## Round 3: System design and leadership

**Design a highly available backend for a mobile app: auth, notifications, remote access, user preferences.** Cognito (or an OIDC provider) for authentication, API Gateway + Lambda or an ALB + EKS service layer, DynamoDB (global tables for multi-region) for preferences, SNS Mobile Push / Pinpoint for notifications, IoT Core (MQTT) or WebSockets (API Gateway WebSocket) for remote access to devices, and CloudFront for static content. Multi-AZ throughout, multi-region active-active for critical APIs, WAF, and observability. → [Tesla design answer](tesla.md)

**A globally distributed platform for securely delivering software updates to millions of devices.** S3 origin (versioned, replicated) behind CloudFront with **signed URLs**, packages signed with KMS or an HSM, manifests verified by the devices, IoT Jobs or a rollout service for staged waves with automatic halt, and telemetry back through IoT Core/Kinesis. → [Tesla OTA answer](tesla.md)

**Multi-region DR with minimal downtime and automated failover.** → [Core: DR](../core-answers.md#dr-strategies). Add Route 53 Application Recovery Controller for safe, controlled failover with routing controls and readiness checks.

**An observability platform with CloudWatch, OpenTelemetry, X-Ray, Prometheus and Grafana, without alert fatigue.** ADOT/OpenTelemetry collectors everywhere, metrics to AMP (Prometheus) and CloudWatch, traces to X-Ray, logs to CloudWatch/OpenSearch, Grafana as the single pane with trace-to-log links, SLO-based burn-rate alerts routed by ownership through Alertmanager or SNS to PagerDuty. → [Core: alerting](../core-answers.md#alerting)

**A platform processing millions of real-time events per second with Kinesis, SQS, SNS, EventBridge, Lambda and EKS.**

- **Ingest**: Kinesis Data Streams (sharded by key, on-demand or provisioned shards) or MSK for very high throughput.
- **Processing**: consumers on EKS (KCL or Flink on Managed Service for Apache Flink) for heavy stream processing. Lambda with batching for lighter, spiky work.
- **Fan-out**: SNS → SQS for independent subscribers, EventBridge for routing low-to-medium-volume business events by rules.
- **Storage**: S3 (Firehose → Parquet), DynamoDB for current state.
- Back-pressure through buffering, DLQs, idempotent consumers, and scaling on iterator age and queue depth.
