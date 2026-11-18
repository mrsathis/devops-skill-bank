---
tags:
  - interview
  - aws
---

# AWS and cloud questions (company not named)

## Networking

**Explain VPC, subnet, route table, security groups; VPC vs subnet; public vs private subnets.** → [Core](../core-answers.md#vpc-basics)

**NAT gateway vs Internet gateway; private instances reaching the internet; a database in a private subnet that needs packages securely; private EC2 downloading packages without NAT or a bastion.** → [Core](../core-answers.md#nat-gateway). Without NAT: VPC endpoints for AWS services, an S3 gateway endpoint plus a **package mirror in S3** or CodeArtifact (through an interface endpoint) for pip, npm and Maven, an internal proxy (Squid) in a public subnet, or pre-baked AMIs with the packages already installed. Amazon Linux repositories are hosted in S3, so the S3 gateway endpoint plus the right endpoint policy lets `dnf` work with no internet at all.

**The app is in a public subnet, the database in a private subnet: how does data flow?** Both are in the same VPC, so the **local route** connects all subnets. The app connects to the database's private endpoint. The DB security group allows the DB port from the app's security group. No NAT is involved. Only traffic to the internet needs the IGW or NAT.

**How do you troubleshoot a VPC?** Systematically: route tables (does the path exist: IGW, NAT, TGW, peering, endpoints), security groups (inbound and outbound), NACLs (stateless, ephemeral ports), DNS settings (`enableDnsSupport`/`Hostnames`, private hosted zones), **VPC Reachability Analyzer** (point-to-point path analysis that names the blocking component), VPC Flow Logs (ACCEPT/REJECT), and the OS firewall.

<a id="tgw-vs-peering"></a>

**How does VPC peering work? Connecting multiple VPCs; Transit Gateway vs VPC peering; hub and spoke; 500 accounts communicating internally.**

- **VPC peering**: a one-to-one private connection (same or cross region, same or cross account). Add routes on both sides, and security groups can reference peered SGs (same region). It's **non-transitive** (A↔B and B↔C doesn't give A↔C), CIDRs can't overlap, and there's no bandwidth bottleneck and no hourly cost (only data transfer).
- **Transit Gateway**: a regional **hub** that many VPCs, VPNs and Direct Connect attach to. Transitive routing through TGW route tables, segmentation (separate route tables per environment), inter-region peering, centralised egress or inspection. You pay per attachment-hour and per GB.
- Use peering for a few VPCs. Use TGW (**hub and spoke**) beyond a handful, and for hybrid connectivity.
- **500 accounts**: TGW shared through **AWS RAM** to the organisation, attachments automated by Account Factory or Terraform, route tables per segment, IPAM for non-overlapping CIDRs. Alternatively, **VPC sharing** (shared subnets from a central network account) or **VPC Lattice / PrivateLink** for service-to-service connectivity without full network routing.

**Same CIDR in two VPCs in different accounts: can you peer them? Alternatives?** **No.** Peering (and normal TGW routing) needs non-overlapping CIDRs. Alternatives: **PrivateLink** (expose a service through an NLB endpoint service, so overlapping CIDRs don't matter), a **private NAT gateway** to translate into a routable range, VPC Lattice, re-IP one VPC, or add a secondary non-overlapping CIDR for the subnets that need to talk.

**Transit Gateway vs Direct Connect; site-to-site VPN vs Direct Connect; NAT Gateway vs Transit Gateway.** **Direct Connect** is a dedicated private physical link from on-prem to AWS (consistent latency, high bandwidth, lower egress cost, weeks to provision, not encrypted by default, so use MACsec or VPN over it). **Site-to-site VPN** is IPsec over the internet (quick, cheap, encrypted, variable performance, up to ~1.25 Gbps per tunnel). Often VPN is the backup for DX. TGW is the hub they all attach to. **NAT GW** translates private-to-internet outbound traffic. **TGW** routes between networks. They solve different problems.

**Instance 2 (static IP) needs to talk to Instance 1 in a private subnet behind a multi-AZ load balancer.** If Instance 2 is outside the VPC, it calls the **load balancer** (internet-facing, or internal over VPN, DX or peering), and the load balancer reaches Instance 1 in the private subnet. Allow Instance 2's static IP in the load balancer's security group, and the load balancer's SG in Instance 1's SG. If they're in the same or a connected VPC, use the internal load balancer DNS or the private IP with the matching security group rules.

**You've exhausted IP addresses in your VPC: how do you provision new resources?** Add a **secondary CIDR block** to the VPC (for example `100.64.0.0/16` for EKS pods with custom networking) and create new subnets. Clean up unused ENIs and IPs, use EKS prefix delegation, or move workloads to a new VPC connected through TGW. Plan with IPAM next time.

**How do you block traffic from a particular country or region?** **AWS WAF geo-match rule** on CloudFront, ALB or API Gateway (block or count by country code), **CloudFront geo-restriction** (allowlist or denylist), or Route 53 geolocation routing to send those users elsewhere. NACLs aren't practical for this (rule limits and IP ranges change constantly).

**What is AWS WAF?** A layer-7 web application firewall attached to CloudFront, ALB, API Gateway, AppSync or Cognito. Web ACLs with rules: AWS Managed Rules (OWASP top 10, known bad inputs, SQL injection, bots), rate-based rules, IP sets, geo-match, regex and header conditions, and allow, block, count or CAPTCHA actions. It logs to S3, CloudWatch or Firehose. Use Shield Advanced for DDoS response.

**ALB, NLB, CLB, CloudFront; types of load balancers with examples; how an ELB distributes traffic; connection draining; latency of a load balancer and monitoring high latency.** → [Core](../core-answers.md#alb-nlb-cloudfront). There's also the **Gateway Load Balancer** (inline third-party appliances, GENEVE). Load balancer overhead is typically **single-digit milliseconds**. If `TargetResponseTime` is high, the targets are slow. If client-measured latency is high but `TargetResponseTime` is low, look at the client network, TLS, or the load balancer scaling (surge queue, spillover on CLB). Monitor `TargetResponseTime` percentiles, `RequestCount`, `HTTPCode_*`, `ActiveConnectionCount`, `RejectedConnectionCount`, and access logs (`request_processing_time`, `target_processing_time`, `response_processing_time`).

**Can a load balancer route to another region?** → [Mphasis](../companies/mphasis.md)

**Route 53 load balancing / routing policies.** → [HCLTech](../companies/hcltech.md)

**What is a CDN and how does it work? Which services integrate with CloudFront? An app hosted in S3 with users across the world: reduce latency.** A CDN caches content at **edge locations** near users. On a cache miss the edge fetches from the **origin** (S3, ALB, API Gateway, any HTTP server, MediaStore or MediaPackage) and caches it per its cache policy. Integrations: S3 (with Origin Access Control), ALB/EC2, API Gateway, Lambda function URLs, WAF, Shield, ACM, Lambda@Edge and CloudFront Functions. For S3-hosted apps: put **CloudFront** in front (OAC, long TTLs for versioned assets, compression, HTTP/3), plus S3 **Transfer Acceleration** for uploads, or cross-region replicated buckets with latency routing for dynamic regional needs.

**CloudFront serving different content by country; small logic at the edge without changing the app.** CloudFront adds the `CloudFront-Viewer-Country` header (include it in the cache key or origin request policy) so the origin or edge logic can vary content. Use **CloudFront Functions** (lightweight JS at the viewer request/response: redirects, header rewrites, URL normalisation, simple A/B) or **Lambda@Edge** (heavier logic at origin request/response with network access, for example auth, dynamic origin selection, image transforms). Geo-restriction blocks countries outright.

**What happens when you hit a CloudFront URL?** DNS resolves the CloudFront domain to the nearest edge location (latency-based) → TLS handshake at the edge (ACM certificate, SNI) → WAF evaluation → CloudFront Function (viewer request) → cache lookup by cache key. A **hit** is served from the edge. A **miss** goes to a regional edge cache, then the origin (through Origin Shield if enabled) with origin request policies and Lambda@Edge → the response is cached per TTL and headers → returned to the viewer.

**Typical 3-tier architecture; highly available, scalable, fault-tolerant design; HA with Auto Scaling, ELB and Multi-AZ.** → [Core](../core-answers.md#aws-ha)

**Multi-AZ architecture.** Spread every tier across at least 2–3 AZs: subnets per AZ, ALB across AZs, an ASG or EKS node groups across AZs with health checks, RDS Multi-AZ, ElastiCache Multi-AZ with auto-failover, a NAT GW per AZ, and stateless app instances. Test by simulating an AZ failure (AWS FIS, ARC zonal shift).

## Compute and containers

**EC2 vs traditional VMs; creating a server in EC2; creating a VM on your own server.** EC2 instances are VMs on AWS's Nitro hypervisor, but **on-demand, API-driven, elastic, pay-per-second**, with integrated networking, storage and IAM, and AWS-managed hardware. Create one: choose an AMI → instance type → key pair or SSM → VPC, subnet and security group → storage → IAM role → user data → launch (console, CLI `aws ec2 run-instances`, or Terraform). On your own server: install a hypervisor (KVM with libvirt/virt-manager or `virt-install`, Proxmox, VMware ESXi, Hyper-V, or VirtualBox for desktops), then create a VM from an ISO or cloud image.

**Choosing an instance type: which parameters?** Workload profile (CPU-bound → C, memory-bound → R/X, general → M/T, GPU → G/P, storage-heavy → I/D), vCPU and RAM measured from load tests, network bandwidth and EBS throughput limits, architecture (Graviton/ARM for price-performance if supported), burstable (T) only for spiky low-average loads (watch credits), the pricing model (Spot or Savings Plans), and current-generation families. Right-size with Compute Optimizer.

**EC2 status checks 2/2 vs 3/3.** Traditionally two checks: **system status** (AWS host or network) and **instance status** (OS reachability). Newer instances can show a **third check: attached EBS status**, which verifies the attached EBS volumes are reachable and can complete I/O. 3/3 means the system, instance and EBS checks all pass.

**EC2 intermittently unresponsive 2–5 PM, CPU, memory and disk look normal, but the system queue length rises.** A growing run queue (load average above the vCPU count) with "normal" utilisation suggests **CPU steal or credit throttling**, or blocked I/O. Check: a **T-instance out of CPU credits** (`CPUCreditBalance` hits zero in the afternoon, so the CPU is capped at baseline: switch to unlimited mode or an M or C type), `%st` steal, `%wa` iowait (EBS burst balance exhausted on gp2, or throughput limits hit by a daily job: `BurstBalance`, `VolumeQueueLength`), a scheduled batch or backup at 2 PM, lock contention, or network throttling (`ethtool -S` allowance exceeded counters). Run `vmstat 1`, `sar -q`, `iostat -x`, and match the window against cron and CloudWatch.

**Unable to SSH to an EC2 instance in a public subnet; SSH failing even with password authentication enabled; Sev-1 SSH incident.** → [Core](../core-answers.md#ec2-ssh)

**Unreachable EC2 / an app reachable internally but not from the internet.** → [Core](../core-answers.md#ec2-ssh). Internet-only failure: the load balancer is internal rather than internet-facing, no public IP or IGW route, the security group only allows internal CIDRs, a WAF block, DNS pointing at a private record, or NACLs.

**Auto Scaling isn't launching new instances fast enough.** Check scaling activity history (errors such as insufficient capacity, launch template issues, AMI not found, IAM role, subnet IPs or **service quotas**), the alarm or metric configuration (period and evaluation periods too long, a metric that lags), **health check grace period** and warm-up settings, slow boot or user data (bake AMIs, use **warm pools**), cooldowns, and instance type availability (use several types and AZs). Add predictive scaling or scheduled scaling for known peaks.

**How does auto scaling work?** An ASG keeps capacity between min and max across AZs, replacing unhealthy instances (EC2 or ELB health checks). Scaling policies: target tracking (keep CPU or requests per target at X), step or simple scaling on CloudWatch alarms, scheduled, predictive (machine learning forecasts). Lifecycle hooks, warm pools, instance refresh for rolling AMI updates, and termination policies.

**Restrict instances from running on weekends and holidays.** The **AWS Instance Scheduler** solution, or **EventBridge Scheduler** with cron schedules calling the SSM Automation `AWS-StopEC2Instance`/`StartEC2Instance` (or a Lambda) for tagged instances. ASG scheduled actions to set desired capacity to 0. For holidays, a calendar in the schedule configuration (the Instance Scheduler supports periods) or SSM Change Calendar. Enforce with tags and policies.

**Have you used EventBridge?** Yes: an event bus for routing AWS service events (EC2 state changes, GuardDuty findings, CodePipeline status) and custom app events to targets (Lambda, SQS, Step Functions, SNS) by rules, plus **EventBridge Scheduler** for cron jobs, and Pipes for point-to-point integrations.

**Customised AMIs: which tools?** **Packer** (HCL templates, multi-cloud, CI-friendly) or **EC2 Image Builder** (AWS-managed pipelines with components, tests and distribution across accounts and regions). Bake hardened, patched images with agents. → [Atlassian AMI checklist](../companies/atlassian.md)

**Sharing an AMI from the management account with child accounts; instances launched from it keep terminating; identifying whether the shared AMI is the problem.** Share by modifying launch permissions (`aws ec2 modify-image-attribute --launch-permission Add=[{OrganizationArn=...}]` or per account). **If the AMI's snapshots are encrypted**, you must also share the **KMS key** (key policy plus grants for the target accounts) and use a customer-managed key. AMIs encrypted with the default `aws/ebs` key can't be shared. The **launch-then-terminate** loop usually comes from: the KMS key not being accessible (the instance goes to `terminated` with the state reason `Client.InternalError` / `Client.InvalidKMSKey.InvalidState`), an ASG health check failing and replacing the instance, an instance type and AMI architecture or virtualisation mismatch (missing ENA or NVMe drivers), or a quota. Diagnose with `aws ec2 describe-instances --query 'Reservations[].Instances[].StateReason'`, the ASG activity history, CloudTrail, and the console output.

**What are ECS and ECR? Components of ECS; more than one service in an ECS cluster; ECS with Fargate; ECS architecture design.** **ECR** is AWS's private container registry (scanning, lifecycle policies, replication, immutable tags). **ECS** components: **cluster** (a logical grouping), **task definition** (container definitions: image, CPU and memory, ports, env, secrets, logging, IAM **task role** and **execution role**), **task** (a running instance), **service** (keeps N tasks running, integrates with ALB target groups, rolling or blue-green deployments with CodeDeploy, auto scaling), and **capacity providers** (EC2 ASG or **Fargate/Fargate Spot**). Yes, a cluster runs **many services**. Design: ECS services on Fargate in private subnets across AZs, an ALB with path routing, Service Connect or Cloud Map for discovery, Application Auto Scaling, CloudWatch Container Insights, and secrets from Secrets Manager.

**ECS microservices latency after scaling: some services slow.** Check the services' task CPU and memory utilisation and **throttling** (CPU units too low), the ALB target response time per target group (one slow AZ or task?), dependencies (connection pool limits when task count increases, so the database hits `max_connections`), noisy neighbours on EC2-backed capacity, ENI or awsvpc IP limits, service discovery or DNS caching, and cold-start warm-up (health check grace). X-Ray or OTel traces show which hop added the latency.

**ECS vs EKS vs Fargate: when to choose which.** → [Big 4](../companies/big4-aws-devops.md). Fargate is the serverless compute option for ECS or EKS (no nodes to manage, per-task billing, some limits: no DaemonSets on EKS Fargate, no privileged containers, no GPUs).

<a id="ecr-push"></a>

**Create Docker images and push them to ECR.**

```bash
aws ecr create-repository --repository-name app --image-scanning-configuration scanOnPush=true
aws ecr get-login-password --region eu-west-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.eu-west-1.amazonaws.com
docker build -t app:1.4.2 .
docker tag app:1.4.2 123456789012.dkr.ecr.eu-west-1.amazonaws.com/app:1.4.2
docker push 123456789012.dkr.ecr.eu-west-1.amazonaws.com/app:1.4.2
```

In CI, authenticate through OIDC to a role with ECR push permissions (`aws-actions/amazon-ecr-login`).

**What is Lambda and how does it work? Invocation and configuration; scaling and event-based invocation; max runtime and memory; increasing runtime; automations with Lambda; where you write Lambda code; which modules you used.**

- Serverless functions: you upload code (a zip or container image), AWS runs it in **Firecracker micro-VMs** on events, scales automatically and bills per request and per millisecond of duration × memory.
- **Invocation types**: synchronous (API Gateway, function URL, SDK `Invoke`), asynchronous (S3, SNS, EventBridge, with retries and DLQ or on-failure destinations), and **event source mappings** that poll (SQS, Kinesis, DynamoDB Streams, Kafka, with batching).
- **Scaling**: one execution environment per concurrent request. Concurrency limits per account (default 1,000 per region, raisable), reserved and provisioned concurrency (to avoid cold starts), and burst scaling rules.
- **Limits**: max **timeout 15 minutes** (900 s), memory **128 MB–10,240 MB** (CPU scales with memory), `/tmp` up to 10 GB.
- **Longer than 15 minutes**: you can't raise it. Split the work, use **Step Functions** to orchestrate, or move to ECS/Fargate or Batch.
- Typical automations: EBS snapshot cleanup, start and stop schedules, tagging enforcement, S3 event processing (thumbnails, ETL), Slack alerts from SNS, auto-remediation of Config findings.
- Code lives in Git and is deployed through IaC (SAM, Terraform, CDK) and CI, never edited in the console. Modules: boto3, requests, Powertools for AWS Lambda (logging, tracing, metrics).

**Lambda can't access a database hosted on EC2; connecting Lambda to the outside world.** A Lambda **in a VPC** needs: the right subnets (the same VPC or routable), its security group allowed by the DB instance's security group on the DB port, a route for internet or AWS API access (**VPC Lambdas have no public IP**, so they need a NAT gateway in private subnets or VPC endpoints), the execution role with `AWSLambdaVPCAccessExecutionRole` (ENI permissions), DNS resolution, correct credentials, and a timeout long enough. A Lambda **not** in a VPC has internet access but can't reach private IPs.

**How many Lambda functions can execute in a single account?** There's no limit on the number of functions (storage for code has a quota of 75 GB per region, adjustable). The limit is **concurrent executions**: 1,000 per region by default (a soft limit you can raise), shared by all functions unless reserved.

**Lambda execution time increased and timeouts appeared: optimise.** Find the cause with X-Ray and CloudWatch (init duration means cold starts, downstream latency, throttling). Then: increase memory (more CPU), use provisioned concurrency or SnapStart for cold starts, reuse connections and clients outside the handler, RDS Proxy for database connections, a smaller package, async or batch processing (SQS), right-size timeouts, set reserved concurrency to protect downstreams, and check VPC networking (NAT throughput).

**What are API Gateways?** A managed front door for APIs: REST and HTTP APIs and WebSockets, routing to Lambda, HTTP backends or AWS services, with authentication (IAM, Cognito, Lambda authorisers, JWT), throttling and usage plans, caching, request validation, stages and custom domains. → [J.P. Morgan #19](../companies/jp-morgan.md)

**Write a CloudFormation template to deploy an EC2 instance and an ALB.**

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  VpcId: { Type: AWS::EC2::VPC::Id }
  PublicSubnets: { Type: List<AWS::EC2::Subnet::Id> }
  AppSubnet: { Type: AWS::EC2::Subnet::Id }
  AmiId: { Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>, Default: /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 }
Resources:
  AlbSG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: ALB
      VpcId: !Ref VpcId
      SecurityGroupIngress: [{ IpProtocol: tcp, FromPort: 80, ToPort: 80, CidrIp: 0.0.0.0/0 }]
  AppSG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: App
      VpcId: !Ref VpcId
      SecurityGroupIngress: [{ IpProtocol: tcp, FromPort: 80, ToPort: 80, SourceSecurityGroupId: !Ref AlbSG }]
  Instance:
    Type: AWS::EC2::Instance
    Properties:
      ImageId: !Ref AmiId
      InstanceType: t3.micro
      SubnetId: !Ref AppSubnet
      SecurityGroupIds: [!Ref AppSG]
      UserData: !Base64 |
        #!/bin/bash
        dnf install -y nginx && systemctl enable --now nginx
  TG:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      VpcId: !Ref VpcId
      Port: 80
      Protocol: HTTP
      HealthCheckPath: /
      Targets: [{ Id: !Ref Instance }]
  ALB:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Subnets: !Ref PublicSubnets
      SecurityGroups: [!Ref AlbSG]
  Listener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref ALB
      Port: 80
      Protocol: HTTP
      DefaultActions: [{ Type: forward, TargetGroupArn: !Ref TG }]
Outputs:
  Url: { Value: !GetAtt ALB.DNSName }
```

**Create a single IAM role across all accounts (multi-account CloudFormation).** Use **CloudFormation StackSets** with **service-managed permissions** (AWS Organizations integration) targeting the organisation or specific OUs, with automatic deployment to new accounts. The template defines the `AWS::IAM::Role` (CAPABILITY_NAMED_IAM). Control Tower customisations (CfCT) or Account Factory customisations also work.

**Fetch all EC2 instances across all accounts and regions / within one OU.** Options: **AWS Config aggregator** (organisation-wide) with an advanced query (`SELECT resourceId, accountId, awsRegion WHERE resourceType = 'AWS::EC2::Instance'`), **AWS Resource Explorer** with an aggregator index, or a script: list accounts (`organizations list-accounts-for-parent --parent-id ou-xxxx` for one OU, recursing into child OUs), assume a read-only role in each, loop over `ec2 describe-regions`, and call `describe-instances`.

```python
import boto3
org, sts = boto3.client("organizations"), boto3.client("sts")
def accounts_in_ou(ou):
    for page in org.get_paginator("list_accounts_for_parent").paginate(ParentId=ou):
        yield from page["Accounts"]
    for page in org.get_paginator("list_children").paginate(ParentId=ou, ChildType="ORGANIZATIONAL_UNIT"):
        for child in page["Children"]:
            yield from accounts_in_ou(child["Id"])
for acct in accounts_in_ou("ou-abcd-12345678"):
    c = sts.assume_role(RoleArn=f"arn:aws:iam::{acct['Id']}:role/ReadOnlyAudit", RoleSessionName="inv")["Credentials"]
    s = boto3.Session(aws_access_key_id=c["AccessKeyId"], aws_secret_access_key=c["SecretAccessKey"], aws_session_token=c["SessionToken"])
    for region in [r["RegionName"] for r in s.client("ec2", "us-east-1").describe_regions()["Regions"]]:
        for page in s.client("ec2", region).get_paginator("describe_instances").paginate():
            for r in page["Reservations"]:
                for i in r["Instances"]:
                    print(acct["Id"], region, i["InstanceId"], i["State"]["Name"])
```

## Storage and databases

<a id="s3-classes"></a>

**S3 storage classes; Glacier usage and archival strategy; S3 types.**

| Class | Use |
|---|---|
| S3 Standard | Frequently accessed data |
| S3 Intelligent-Tiering | Unknown or changing access, auto-tiering (small monitoring fee) |
| S3 Standard-IA / One Zone-IA | Infrequent access, retrieval fee, 30-day minimum (One Zone: single AZ, cheaper, reproducible data only) |
| S3 Express One Zone | Single-digit-ms latency, high request rates, a single AZ (directory buckets) |
| Glacier Instant Retrieval | Archive accessed about quarterly, millisecond retrieval, 90-day minimum |
| Glacier Flexible Retrieval | Archive, minutes to hours retrieval, 90-day minimum |
| Glacier Deep Archive | Lowest cost, about 12 hours retrieval, 180-day minimum (compliance and long-term backups) |

Archival strategy: **lifecycle rules** (for example Standard → Standard-IA at 30 days → Glacier Flexible at 90 → Deep Archive at 365 → expire at 7 years), also for noncurrent versions, and watch minimum durations and per-object overhead for small files.

**Delete a bucket and create one with the same name: possible?** Bucket names are **globally unique**. After deletion the name becomes available again, usually after a short delay, but **anyone** could claim it first. You can create it again if it's still free. Don't design anything around reusing deleted names.

**If an S3 bucket has a read-only policy, can you modify objects?** Not as a principal whose access is restricted by that policy. If the bucket policy has an explicit **Deny** on `s3:PutObject`/`DeleteObject`, nobody (except root, and only for policy changes) can write, because an explicit deny wins. If the policy only *grants* read to some principals, others with IAM write permission in the same account can still write (unless denied). Object Lock or governance retention also prevents modification.

**Make one folder or object public / give access to a specific file to an external user or another account; bucket policy vs IAM policy vs pre-signed URL; temporary access.** Prefer **pre-signed URLs** for temporary access to one object (signed with the creator's credentials, expiry up to 7 days with IAM user keys, shorter with role sessions). For another account: a **bucket policy** granting that account's principal access to `arn:aws:s3:::bucket/path/file` (plus their IAM policy allowing it, and KMS key policy access if encrypted with SSE-KMS). For a truly public prefix: turn off Block Public Access *only* where intended (account and bucket level) and add a bucket policy allowing `s3:GetObject` on `bucket/public/*`, ideally with CloudFront and OAC instead of a public bucket. **IAM policies** attach to identities in your account. **Bucket policies** attach to the bucket (resource-based, and can grant cross-account access).

**An app on EC2 in Account B reads an S3 bucket in Account A.** The EC2 instance role in B has an IAM policy allowing `s3:GetObject`/`ListBucket` on A's bucket, **and** A's bucket policy allows B's role ARN. If SSE-KMS, A's KMS key policy allows the role to decrypt. Alternatively, B assumes a role in A. Check Block Public Access doesn't matter (it isn't public) and that Object Ownership is set to BucketOwnerEnforced for writes.

**Host a single-page application in S3.** Build the SPA, upload it to a **private** bucket, put **CloudFront** in front with **Origin Access Control**, set the default root object to `index.html`, add custom error responses mapping 403 and 404 to `/index.html` (200) for client-side routing, use an ACM certificate (us-east-1) and a Route 53 alias, long cache headers on hashed assets, short on `index.html`, and invalidate on deploy. (The static-website endpoint also works, but it's HTTP-only and public.)

**Attach an SSL certificate to an S3 bucket.** You can't attach a certificate to an S3 bucket directly. S3's endpoints use AWS's certificate for `*.s3.amazonaws.com`. For **HTTPS on a custom domain**, put **CloudFront** in front with an **ACM certificate in us-east-1**, and point Route 53 at the distribution.

**Encryption types in your project.** At rest: S3 SSE-S3 or **SSE-KMS** (customer-managed keys, bucket keys for cost), EBS and RDS encryption with KMS, Secrets Manager (KMS). In transit: TLS everywhere (ACM certificates, enforce `aws:SecureTransport` in bucket policies, RDS `require_secure_transport`), mTLS within the mesh. Client-side encryption for highly sensitive data. Key rotation and key-policy separation of duties.

**Different types of AWS storage / disks.** Block (EBS gp3, io2, st1, sc1, instance store), file (EFS for Linux NFS, FSx for Windows, Lustre, NetApp ONTAP, OpenZFS), object (S3), archive (Glacier), hybrid (Storage Gateway), and data transfer (Snow Family, DataSync). EBS types → [Paytm](../companies/paytm.md)

**Exponential data growth increasing storage cost: a cost-effective design.** Classify data by access pattern and retention, **lifecycle policies and Intelligent-Tiering**, compression and columnar formats (Parquet) with partitioning for analytics, delete or expire temporary data and old versions, deduplicate, gp2 → gp3 and right-size EBS, delete old snapshots (or archive them with EBS Snapshots Archive), S3 Storage Lens for visibility, and per-team showback.

**What is RDS? Parameter groups; RDS can't export to or connect to S3; major version upgrade with minimal downtime; HA.**

- **RDS** is a managed relational database (MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, and Aurora) with automated backups, patching, Multi-AZ, read replicas and monitoring.
- A **parameter group** is a container of engine configuration settings (for example `max_connections`, `work_mem`, `slow_query_log`) applied to instances. *Static* parameters need a reboot. You can't edit the default group, so create a custom one. **Option groups** add engine features.
- **RDS ↔ S3 issues**: the RDS instance needs an **IAM role associated** with the right feature name (`s3Import`/`s3Export` for Postgres `aws_s3`, `SQLSERVER_BACKUP_RESTORE` option for SQL Server native backups), the role's policy must allow the bucket and KMS key, and network access to S3 (an **S3 gateway endpoint** or NAT for private RDS). Check the bucket policy, region and error messages in the RDS logs. (Snapshot *export* to S3 uses a separate export-task role.)
- **Major version upgrade with minimal downtime**: **RDS Blue/Green Deployments** (a green copy is created and kept in sync through logical replication, you upgrade green, test, then switch over in about a minute with endpoint renaming), or a manual logical replication to a new-version instance with a cutover. In-place upgrades mean longer downtime. Test the upgrade on a snapshot restore first.
- HA → [HCLTech](../companies/hcltech.md)

**RDS slow after migration.** → [HCLTech/Core](../companies/hcltech.md). Use **Performance Insights / Database Insights** (top SQL and wait events), missing indexes or statistics (`ANALYZE`), a parameter group not tuned like on-prem (buffer pool or shared buffers, `work_mem`), an undersized instance class, storage IOPS (gp2 credits, so move to gp3 or io2), connection storms (RDS Proxy), network latency (app and DB in different AZs or regions), and the engine's query planner differences after a version change.

**Download or save an RDS backup to S3, but RDS isn't connecting to S3.** See the S3 integration above: the associated IAM role and feature, the option group (SQL Server native backup), KMS permissions, an S3 gateway endpoint or NAT for private subnets, the bucket in the same region, and the bucket policy.

**Database migration, backups, snapshots, S3 cross-region replication as part of DR; regional outage DR.** → [Core: DR](../core-answers.md#dr-strategies)

**Synchronise or migrate ~500 TB from one AWS account to another.** **S3 Batch Replication** or **S3 Replication** (cross-account, with Replication Time Control) for ongoing sync plus a backfill of existing objects, or **AWS DataSync** (S3 to S3 across accounts, parallel, verification, scheduling). Ensure bucket policies on the destination, KMS key access, object ownership (BucketOwnerEnforced), S3 Inventory to compare, and plan request costs and time. If it's not S3 (EFS, FSx), use DataSync. For a database, use snapshots shared to the other account or DMS.

**Migrate 5 TB / 30 TB from on-prem to AWS.** Estimate transfer time from bandwidth: 5 TB over a sustained 1 Gbps is roughly 11–12 hours, and 30 TB is about 3 days. Online: **DataSync** over VPN or Direct Connect (or S3 CLI/Transfer Acceleration for simple cases), then an incremental sync before cutover. Offline: **Snowball Edge** when the bandwidth or window doesn't allow online (tens of TB or more on slow links). Validate with checksums.

<a id="migration"></a>

**End-to-end on-prem migration; discovery and inventory; 7R strategy; replication strategies; synchronous vs asynchronous; minimising downtime and validating after cutover.**

1. **Discover and assess**: inventory servers, apps and dependencies (Application Discovery Service, Migration Evaluator, CMDB, interviews), plus performance baselines, licensing and compliance.
2. **Strategy per app (7Rs)**: **Rehost** (lift and shift with MGN), **Replatform** (for example move to RDS), **Refactor** (cloud-native), **Repurchase** (SaaS), **Retire**, **Retain**, **Relocate** (VMware Cloud on AWS).
3. **Landing zone** first (accounts, network, security, logging).
4. **Wave planning** by dependency groups, a pilot wave first.
5. **Replication**: block-level continuous replication with MGN for servers, DMS full load + CDC for databases, DataSync or Snowball for files. **Synchronous** replication commits on both sides before acknowledging (zero data loss, needs low latency, so for short distances). **Asynchronous** acknowledges locally and ships later (tolerates distance, small data-loss window = replication lag). Migrations normally use asynchronous plus a final sync.
6. **Cutover**: freeze writes, final sync, switch DNS (low TTL set in advance), smoke tests.
7. **Validate**: functional tests, data reconciliation (row counts, checksums), performance against the baseline, monitoring. Keep a rollback path (reverse replication or keep the source running) for a defined period.

**Migrating a Hadoop cluster / SAP from on-prem: services used.** MGN for servers, DMS or SAP-native tools (HANA System Replication, backup/restore) for databases, Snowball Edge or DataSync for large data, Migration Hub to track it, a VPC and security baseline first, migrate dev first, then prod. For Hadoop, consider *replatforming* to EMR with S3 as storage rather than lift and shift.

**On-prem to AWS migration with minimal downtime and data loss.** As above: continuous replication (MGN, DMS CDC) to keep the target in sync, rehearse the cutover, a short final cutover window, and validation.

## Security and IAM

**IAM roles and policies; attaching policies to users and groups; wildcards in IAM; least privilege; access keys and secret keys purpose.** → [Core](../core-answers.md#iam). Attach managed policies to **groups** and put users in groups (or better, use SSO permission sets). **Access keys** are long-term credentials for programmatic access by IAM users, so avoid them: use roles, SSO and OIDC. If you must use them, rotate them, scope them narrowly and monitor their use.

**Write a policy with list access to EC2 instances and an S3 bucket.**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ListEc2", "Effect": "Allow", "Action": ["ec2:DescribeInstances"], "Resource": "*" },
    { "Sid": "ListBucket", "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::my-bucket" },
    { "Sid": "ListAllBuckets", "Effect": "Allow", "Action": ["s3:ListAllMyBuckets"], "Resource": "*" }
  ]
}
```

`ec2:Describe*` actions don't support resource-level restrictions, so `Resource: "*"` is required. `s3:ListBucket` applies to the **bucket** ARN (not `/*`).

**IAM vs SCP; Access Denied even though IAM allows it.** → [Core](../core-answers.md#iam)

**Security practices in AWS; securing an account; protecting sensitive customer data; a robust security strategy.** → [Core](../core-answers.md#aws-security)

**What is GuardDuty?** A managed **threat-detection** service that analyses CloudTrail management and data events, VPC Flow Logs, DNS logs, EKS audit logs, runtime monitoring (EKS, ECS, EC2), RDS login activity, Lambda network activity and S3 data events, using threat intelligence and machine learning. It generates findings (compromised credentials, crypto mining, unusual API calls, malware). Enable it organisation-wide with a delegated admin, and route findings through Security Hub and EventBridge to auto-remediation and alerts.

**AWS Landing Zone strategies; Landing Zone for multi-account governance; a secure multi-account environment; managing multiple accounts.** **Control Tower** (the AWS-managed landing zone: Organizations, OUs, guardrails as SCPs and Config rules, centralised log archive and audit accounts, Account Factory, IAM Identity Center), **Landing Zone Accelerator (LZA)** for regulated and extended needs, or a custom build with Terraform (AWS Control Tower Account Factory for Terraform, AFT). Typical OUs: Security (Log Archive, Audit), Infrastructure (Network, Shared Services), Workloads (Prod / Non-Prod), Sandbox, Suspended. Guardrails: deny leaving the org, deny disabling CloudTrail or GuardDuty, region restrictions, required encryption.

**AWS Config rules and Security Hub for continuous compliance.** **AWS Config** records resource configurations and evaluates **rules** (managed, such as `s3-bucket-public-read-prohibited` and `encrypted-volumes`, or custom Lambda/Guard) and **conformance packs** (CIS, PCI) with **auto-remediation** through SSM Automation. Use an organisation aggregator for a central view. **Security Hub** aggregates findings (Config, GuardDuty, Inspector, Macie, partners) and runs standards (AWS FSBP, CIS) with a security score. Route findings to ticketing or alerts through EventBridge.

**Secret management in AWS with security and compliance.** **Secrets Manager** (rotation through Lambda, native RDS rotation, cross-account resource policies, replication to other regions, KMS) or **SSM Parameter Store** SecureString (cheaper, no built-in rotation). Access through IAM roles (IRSA for pods), audited by CloudTrail, never stored in code, env files or AMIs. Kubernetes uses External Secrets.

**CloudTrail shows suspicious activity using an access key: investigate and respond.** → [Core: leaked key](../core-answers.md#leaked-key)

**Given an IAM role ARN, find who uses it.** → [Big 4](../companies/big4-aws-devops.md)

**IRSA / ServiceAccount to CloudWatch.** → [Big 4](../companies/big4-aws-devops.md)

## Monitoring and operations

**CloudWatch: what it is; custom metrics; dashboard metrics; configuring CPU utilisation on a dashboard; what to monitor for EC2, RDS and apps; CloudWatch vs CloudTrail.**

- **CloudWatch** = metrics, logs (Logs Insights), alarms, dashboards, events (now EventBridge), Container Insights, Application Signals and synthetics canaries.
- **Custom metrics**: `aws cloudwatch put-metric-data --namespace App --metric-name Orders --value 1`, embedded metric format (EMF) in logs, or the **CloudWatch agent** (memory and disk aren't default EC2 metrics, so the agent is needed for them).
- **Dashboards**: add a widget → metric `AWS/EC2 CPUUtilization` by InstanceId or AutoScalingGroupName, statistic average and p95, period 1–5 minutes, plus alarm annotations.
- **What to monitor**: EC2 (CPU, status checks, CPU credits, network, and memory or disk through the agent), RDS (CPU, FreeableMemory, FreeStorageSpace, DatabaseConnections, Read/WriteLatency, IOPS, ReplicaLag, Performance Insights), app (latency percentiles, error rate, throughput, business KPIs, health checks).
- **CloudTrail** records **API calls** (who did what, when, from where) for audit and security. **CloudWatch** records **performance and operational** data. "I used CloudWatch for alarms on latency and errors, and CloudTrail to investigate who changed a security group."

**Monitor application logs.** CloudWatch Logs (agent or awslogs/FireLens drivers) with metric filters and Logs Insights, or ELK/OpenSearch, Loki, Splunk, with structured logging and trace IDs. Alerts on error-rate patterns. → [J.P. Morgan #10](../companies/jp-morgan.md)

**An application suddenly goes down: what do you check first? IAM, networking, infrastructure or app?** → [AWS round 2](../companies/aws.md). Start from symptoms (status codes, which layer answers), then recent changes. **IAM** issues show as `AccessDenied` in app logs and CloudTrail. **Networking** shows as timeouts or connection refused (Reachability Analyzer, flow logs REJECT). **Infrastructure** shows in health checks, instance status, scaling events and AWS Health. **Application** shows as exceptions, crash loops or 500s.

**High-traffic web app with intermittent latency and downtime at peak.** Correlate peaks with saturation: ASG scaling lag (scale earlier, predictive scaling, warm pools), database bottlenecks (Performance Insights, connections, add read replicas, caching with ElastiCache), load balancer and target health flapping, thread or connection pools, burst credits (T instances, gp2), and downstream rate limits. Add CloudFront caching, queue writes, load-test to the peak, and set SLO alerts.

**Microservices on AWS: scalable, resilient infrastructure for deployment, communication and monitoring.** EKS or ECS with service discovery (Cloud Map, Service Connect or a mesh), an API Gateway or ALB at the edge, async messaging (SQS, SNS, EventBridge, MSK), a database per service, CI/CD per service with progressive delivery, observability with OTel to X-Ray/CloudWatch or Prometheus/Grafana, resilience patterns (timeouts, retries, circuit breakers), and secrets in Secrets Manager.

**A globally distributed app with low latency (CloudFront, Route 53, Global Accelerator).** CloudFront for cacheable and dynamic HTTP acceleration, **Global Accelerator** for anycast static IPs and fast regional failover for TCP/UDP or non-cacheable APIs (traffic enters the AWS backbone at the nearest edge), **Route 53 latency-based routing** with health checks across regional stacks, data replicated globally (DynamoDB global tables, Aurora Global Database with write forwarding), and a stateless compute tier in each region.

**Proactive alerting for potential failures.** Alert on leading indicators: SLO burn rate, saturation trends (disk forecast `predict_linear`, connection pool usage, queue age), certificate expiry, error-rate anomalies (CloudWatch anomaly detection), synthetic canaries failing, quota usage approaching limits (Service Quotas alarms), and replication lag. → [Core: alerting](../core-answers.md#alerting)

**Prometheus vs CloudWatch.** **Prometheus**: open source, pull-based, powerful PromQL, label-rich dimensional data, Kubernetes-native ecosystem, portable, but you run it (or use AMP), and long-term storage needs Thanos, Mimir or AMP. **CloudWatch**: native, zero setup for AWS service metrics, integrated alarms and actions, but costs grow with custom metrics, high-cardinality dimensions and queries, and querying is less expressive. Use both: CloudWatch for AWS services, Prometheus for Kubernetes and app metrics.

**Log aggregation across multiple accounts.** Centralise into a **log archive account**: CloudWatch Logs **cross-account subscriptions** to Kinesis Data Firehose → S3 or OpenSearch, CloudTrail organisation trail to the central S3 bucket, VPC flow logs to the central S3, and **CloudWatch cross-account observability** (a monitoring account linked to source accounts) for unified dashboards. Use S3 bucket policies, KMS keys and retention policies.

**Backup tools you've used.** **AWS Backup** (central policies for EBS, RDS, DynamoDB, EFS and S3, cross-account and cross-region copies, Vault Lock for immutability), RDS automated backups and PITR, Velero for Kubernetes resources and volumes, plus regular restore tests.

**What other AWS services have you used? Which are you proficient in?** List what you've actually used and explain *how*: compute (EC2, EKS, ECS, Lambda), networking (VPC, TGW, Route 53, CloudFront), data (RDS, DynamoDB, S3, ElastiCache), security (IAM, KMS, Secrets Manager, GuardDuty), operations (CloudWatch, SSM, Config, CloudTrail), and integration (SQS, SNS, EventBridge).

**Load balancing based on Route 53?** Yes: weighted or latency records with health checks distribute traffic across endpoints or regions (DNS-level, coarse-grained, affected by client DNS caching). It complements, not replaces, ELB.

**Same AWS account for all environments? Separate Jenkins per environment? Which environments did you set up?** Best practice: **separate accounts per environment** (dev, test, staging, prod) under Organizations for isolation, IAM boundaries and cost tracking. Jenkins: one central CI (or per business unit) with **per-environment credentials and agents** (prod deploy agents in the prod account, or OIDC roles per environment), rather than a separate Jenkins per environment. Describe what you actually had.

**Container images on Azure: ACR + Azure Pipelines build, push and deploy.** → [Azure topic](azure.md)

**Multi-cloud environment design; secret management in AWS; cost optimisation in AWS.** → [Netflix multi-cloud](../companies/netflix.md), [Core: cost](../core-answers.md#cost-reduction)

**How would you design HA and multi-region infrastructure to ensure resilience and DR?** → [Core: DR](../core-answers.md#dr-strategies). Start by asking for RTO/RPO, then HA across AZs, then regional strategy (active-passive or active-active), data replication with lag monitoring and protected backups, IaC parity across regions, a verified failover runbook (database readiness, capacity, single-writer protection), and regular DR drills including failback.

**IaaS vs PaaS vs SaaS; when to choose IaaS, PaaS or serverless.** **IaaS**: you manage the OS and up (EC2) for maximum control and legacy apps. **PaaS**: the provider manages the runtime, you deploy code or containers (Elastic Beanstalk, App Service, managed Kubernetes). **SaaS**: you just use the application (M365, Salesforce). **Serverless** (Lambda, Fargate, DynamoDB) is good for event-driven or spiky workloads with no server management and per-use billing, but watch limits, cold starts and cost at high steady load. Example: a nightly ETL on Lambda or Step Functions (serverless), a legacy Windows app with custom drivers on EC2 (IaaS), a standard web API on App Service or ECS Fargate (PaaS-like).

**Benefits of cloud-native tools; what cloud computing means to you; advantages and challenges of moving to the cloud; explaining it to a CEO.** For a CEO: "We stop buying and running our own data centres and rent exactly the computing we need, when we need it. That turns large upfront costs into pay-as-you-go, lets teams launch products in days instead of months, and gives us global reach and resilience we couldn't build alone." Challenges: cost governance, skills, security and compliance responsibility (shared responsibility model), legacy app compatibility, data gravity and migration effort, vendor lock-in.

**Importance of tagging.** Cost allocation and showback, ownership (who to page), automation (schedules, backups, patch groups by tag), security and ABAC (access by tag), and compliance reporting. Enforce with tag policies, SCPs, Terraform default tags and Config rules.

**Different AWS storage options.** → Above.
