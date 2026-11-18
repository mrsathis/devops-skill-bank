---
tags:
  - interview
---

# HCLTech: DevOps Engineer

Two saved posts with almost the same question set. They're merged here.

## Kubernetes and deployment strategies

**Explain the control-plane and worker-node components. What does each do?** → [Core: architecture](../core-answers.md#k8s-architecture)

**Which deployment strategies have you used? Rolling, blue-green and canary, with examples.** → [Core: strategies](../core-answers.md#deployment-strategies). Add a project example, for instance: rolling for internal APIs, blue-green for a monolith with a risky release, canary through Argo Rollouts for the customer-facing checkout service.

**During a blue-green release, what happens to old pods, ongoing requests and live traffic when traffic switches?** New connections go to green as soon as the selector, target group or route changes. **In-flight requests on blue finish** if graceful shutdown is set up correctly (deregistration delay or connection draining on the load balancer, a `preStop` sleep, SIGTERM handling, and a long enough `terminationGracePeriodSeconds`). Blue pods keep running (idle) until you're confident, then get scaled down. Long-lived connections (WebSockets) stay on blue until they close, so plan for that. Sessions must be external (Redis) or users lose them.

**How does node autoscaling work as demand rises or falls? Cluster Autoscaler or Karpenter vs HPA?** → [Core: node autoscaling](../core-answers.md#node-autoscaling)

**How does a new pod get its IP address? Which component handles pod networking?** After scheduling, the kubelet asks the runtime to create the pod sandbox. The runtime calls the **CNI plugin** configured on the node, which creates the network namespace interface (veth), assigns an IP through its IPAM (on EKS the VPC CNI hands out a secondary IP from the node's ENIs, so the pod gets a real VPC IP; overlay CNIs such as Calico or Flannel allocate from a pod CIDR per node), and sets up routes. The IP shows up in the pod status.

**If a subnet runs out of IP addresses, what happens to the pod's status? How would you investigate a sandbox or network setup failure?** The pod stays in **ContainerCreating** with events like `FailedCreatePodSandBox … failed to assign an IP address to container`. Investigate with `kubectl describe pod`, aws-node (VPC CNI) logs, `ipamd` logs on the node, and free IPs in the subnet. Fix it by adding subnets or a secondary CIDR (custom networking), turning on **prefix delegation**, using bigger subnets, and tuning `WARM_IP_TARGET` so nodes don't hoard IPs.

## Observability and CI/CD

**Troubleshoot CPU, memory, restarts, latency and production issues with Prometheus and Grafana.** Use RED dashboards per service and USE dashboards per node. PromQL examples: `sum(rate(container_cpu_usage_seconds_total[5m])) by (pod)`, `container_memory_working_set_bytes`, `increase(kube_pod_container_status_restarts_total[1h]) > 0`, `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))`. Correlate spikes with deploy annotations, then drill down to the pod, node and logs. → [Core: observability](../core-answers.md#observability)

**Explain your actual CI/CD: commit → build → test → security scan → image push → Kubernetes deployment.** → [Core: CI/CD pipeline](../core-answers.md#cicd-pipeline)

**Write a Kubernetes Deployment and Service manifest and explain the main fields.**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web }
spec:
  replicas: 3                       # desired pod count
  selector:
    matchLabels: { app: web }       # must match the template labels
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: web
          image: registry.example.com/web:1.4.2   # immutable tag
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 250m, memory: 256Mi } # scheduling + HPA basis
            limits:   { memory: 512Mi }
          readinessProbe: { httpGet: { path: /ready, port: 8080 } }
          livenessProbe:  { httpGet: { path: /live,  port: 8080 } }
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector: { app: web }            # routes to pods with this label
  ports:
    - port: 80                      # service port
      targetPort: 8080              # container port
```

## Linux and Python

**Which Linux commands check disk usage and available space?** `df -h` (filesystem usage), `df -i` (inodes), `du -sh /path/*` (directory sizes), `du -xh / --max-depth=1 | sort -h`, `lsblk` (block devices), `ncdu` (interactive). → [Core: disk full](../core-answers.md#disk-full)

**Access AWS from Python with Boto3 and manage credentials securely.** `boto3` uses the default credential chain: environment variables, then shared config or SSO profiles, then **IAM roles** (EC2 instance profile, ECS task role, IRSA/Pod Identity on EKS). In production, rely on roles so there are no keys in code. Locally, use `aws sso login` profiles. Never hardcode keys. Fetch app secrets from Secrets Manager.

**Python code to check whether an S3 bucket exists. How do you tell 403 from 404?**

```python
import boto3
from botocore.exceptions import ClientError

def bucket_status(name: str) -> str:
    s3 = boto3.client("s3")
    try:
        s3.head_bucket(Bucket=name)
        return "exists and you have access"
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            return "does not exist"
        if code in ("403", "AccessDenied"):
            return "exists but access is denied (owned by you without permission, or by another account)"
        raise

print(bucket_status("my-example-bucket"))
```

`head_bucket` returns **404** when no bucket has that name and **403** when the bucket exists but you can't access it (bucket names are global).

## AWS, RDS and S3

**What are the Route 53 routing policies? Use cases.**

| Policy | Use case |
|---|---|
| Simple | One resource |
| Weighted | Gradual migration or canary (10% to the new stack) |
| Latency | Send users to the lowest-latency region |
| Failover | Active-passive DR with health checks |
| Geolocation | Content or compliance by user country or continent |
| Geoproximity | Location-based with bias (traffic flow) |
| Multivalue answer | Return several healthy IPs (basic client-side load balancing) |
| IP-based | Route by client CIDR (ISP-specific routing) |

**How do you connect EC2 to RDS?** Put both in the same VPC (or peered or TGW-connected). RDS goes in private DB subnets (a DB subnet group). The **RDS security group** allows the DB port (3306 MySQL, 5432 Postgres) **from the EC2 instance's security group**. Use the RDS **endpoint DNS name**, not an IP, and credentials from Secrets Manager or IAM database authentication. Test with `nc -zv <endpoint> 5432`, then `psql -h <endpoint> -U app -d appdb` or `mysql -h <endpoint> -u app -p`.

**Which RDS engine did you use, and what are your daily database tasks?** Be honest and specific, for example PostgreSQL: monitoring (Performance Insights, slow query log), managing parameter groups, snapshots and restore tests, applying minor version upgrades in maintenance windows, user and permission management, storage autoscaling checks, read replica lag, and helping developers with query plans (`EXPLAIN ANALYZE`).

**How do you make RDS highly available?** **Multi-AZ** (a synchronous standby in another AZ, automatic failover usually within 1–2 minutes, the endpoint DNS flips. Multi-AZ DB *clusters* give two readable standbys and faster failover), automated backups with **PITR**, manual snapshots copied cross-region, read replicas for read scaling (and cross-region DR), RDS Proxy to smooth failovers, CloudWatch alarms (CPU, connections, free storage, replica lag), and Aurora for faster failover and global databases.

**How is S3 used in your project?** Typical uses: application artefacts and static assets (with CloudFront), logs (ALB, CloudTrail, VPC flow logs) with lifecycle rules to Glacier, backups and DB exports, data lake input, and **Terraform state** (versioned, encrypted, locked). Mention the security: Block Public Access, SSE-KMS, bucket policies, and lifecycle.

**"Do you have any questions for me?"** → [Core: behavioural](../core-answers.md#behavioural). Ask about on-call, the deployment pipeline, current infrastructure challenges, and how success is measured in the first 90 days.
