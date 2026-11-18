---
tags:
  - interview
---

# Paytm: DevOps Engineer

## Round 1: Technical

**AWS application design in your current organisation.** Describe it top-down: Route 53 → CloudFront/WAF → ALB → EKS or ECS services in private subnets across AZs → RDS/Aurora Multi-AZ, ElastiCache, S3 → SQS/SNS for async work, plus CI/CD, monitoring and security controls. Give numbers (requests per second, number of services) and the reason behind each choice.

**EC2 volume types; ALB vs NLB.**

| Volume | Type | Use |
|---|---|---|
| gp3 | General Purpose SSD, baseline 3,000 IOPS and 125 MB/s, both adjustable independently of size | Default for most workloads |
| gp2 | General Purpose SSD, IOPS tied to size (3 IOPS/GB) with burst credits | Legacy, migrate to gp3 |
| io1/io2 (Block Express) | Provisioned IOPS SSD, high and consistent IOPS, io2 has 99.999% durability | Critical databases |
| st1 | Throughput-optimised HDD | Big sequential reads (logs, data processing) |
| sc1 | Cold HDD | Infrequently accessed, lowest cost |

ALB vs NLB → [Core](../core-answers.md#alb-nlb-cloudfront).

**Why did your application choose that load balancer?** For example: ALB for HTTP microservices because of path and host routing, WAF integration and OIDC auth. NLB for a TCP or gRPC service needing static IPs for partner allowlisting and very low latency.

**How does CORS work with S3?** CORS lets browser JavaScript from one origin access resources on another. For S3 you set a **CORS configuration** on the bucket (S3 console → bucket → Permissions → CORS, or `put-bucket-cors`) listing `AllowedOrigins`, `AllowedMethods`, `AllowedHeaders` and `MaxAgeSeconds`. S3 then answers the browser's preflight `OPTIONS` request and adds `Access-Control-Allow-Origin` headers. CORS is a browser control, not access control: bucket policies still govern access.

**S3 storage classes; Route 53 and its use in your application.** Storage classes → [Topic: S3 classes](../topics/aws-cloud.md#s3-classes). Route 53: DNS hosting (public and private zones), alias records to ALB or CloudFront, health checks and failover or latency routing.

**AWS Certificate Manager: how does the load balancer get its certificates?** ACM issues free public certificates (validated by DNS, ideally automatically through Route 53 CNAME records) and **renews them automatically**. You attach the certificate ARN to the ALB or NLB HTTPS/TLS **listener** (several certificates with SNI), or to CloudFront (the certificate must be in **us-east-1** for CloudFront). The private keys never leave ACM. You can also import third-party certificates (no auto-renewal).

**Kubernetes pod management, and checking memory and CPU use.** `kubectl top pods -n <ns> --containers`, `kubectl top nodes`, `kubectl describe node` (allocated requests and limits), Prometheus/Grafana for history (`container_memory_working_set_bytes`, CPU usage and throttling), and `kubectl get pod -o yaml` to see requests and limits.

**Kubernetes service types (LoadBalancer, Ingress, ClusterIP, NodePort).** → [Core: services](../core-answers.md#services-ingress). Note that Ingress is not a Service type.

## Round 2: Technical

**Monitoring added to Kubernetes (Prometheus).** kube-prometheus-stack (Prometheus Operator, node-exporter, kube-state-metrics, Alertmanager, Grafana), ServiceMonitors and PodMonitors for app metrics, alert rules, and Grafana dashboards. → [Core: observability](../core-answers.md#observability)

**How NodePort and ClusterIP are managed.** The API server allocates a **ClusterIP** from the service CIDR (`--service-cluster-ip-range`) and a **NodePort** from 30000–32767 (unless specified). kube-proxy on every node watches Services and EndpointSlices and programs iptables or IPVS rules: traffic to ClusterIP:port, or to *any* node's IP:NodePort, is DNATed to a ready backend pod. A NodePort Service also gets a ClusterIP.

**Kubernetes and Linux commands.** `kubectl get/describe/logs/exec/apply/rollout/top/port-forward/cordon/drain`, and Linux `top/ps/df/du/free/ss/journalctl/systemctl/grep/awk/tail -f`.

**Design a PersistentVolume manifest.**

```yaml
# Dynamic provisioning (preferred): StorageClass + PVC
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: gp3 }
provisioner: ebs.csi.aws.com
parameters: { type: gp3, encrypted: "true" }
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
reclaimPolicy: Retain
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: data }
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: gp3
  resources: { requests: { storage: 20Gi } }
---
# Static PV example (pre-existing EBS volume)
apiVersion: v1
kind: PersistentVolume
metadata: { name: pv-existing }
spec:
  capacity: { storage: 20Gi }
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: gp3
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: vol-0123456789abcdef0
```

Mount it in a pod with `volumes: [{name: data, persistentVolumeClaim: {claimName: data}}]` and a `volumeMounts` entry.

**Docker layers and how to debug Docker.** → [Core: layers](../core-answers.md#image-vs-container). Debugging: `docker logs`, `docker inspect` (exit code, OOMKilled, mounts, networks), `docker exec -it … sh`, `docker events`, `docker stats`, `docker history` and `dive` for layers, `docker run --entrypoint sh` to explore an image, and BuildKit `--progress=plain` for build failures.

**Design Jenkins with Sonar, build tools and Ansible integrated.** A Jenkins controller with agents labelled by tool (maven, docker). Pipeline: checkout → `mvn verify` → `withSonarQubeEnv` + `waitForQualityGate` → build and push the artefact or image (Nexus or ECR) → an Ansible stage (`ansiblePlaybook` step or `ansible-playbook -i inventories/prod site.yml` with SSH credentials from the Jenkins credentials store) deploying the artefact to servers → smoke test. Plugins: SonarQube Scanner, Ansible, Credentials Binding, Pipeline.

## Round 3: Technical

**How is deployment done in the cloud with Ansible?** Dynamic inventory (`amazon.aws.aws_ec2` plugin grouping hosts by tags) → playbook roles: install the runtime, pull the artefact from S3 or Nexus, template config, restart the service with handlers, health check. Use `serial` batches behind the load balancer (deregister, deploy, register) for zero downtime. Ansible is **agentless and push-based**, over SSH (or SSM).

**Ansible SSH keys and architecture.** A **control node** (Ansible installed) connects over **SSH** to **managed nodes** listed in the **inventory**, copies Python modules over and runs them, then removes them. Authentication: the control node's private key (from ssh-agent or a CI credential), public keys in the managed nodes' `authorized_keys` (deployed by cloud-init or a bootstrap user), `become` for sudo. Components: inventory, playbooks, roles, modules, plugins, `ansible.cfg`, Vault for secrets.

**Write Ansible roles and a playbook to deploy MySQL.**

```yaml
# site.yml
- hosts: db
  become: true
  roles: [mysql]

# roles/mysql/defaults/main.yml
mysql_root_password: "{{ vault_mysql_root_password }}"   # from ansible-vault
mysql_bind_address: 0.0.0.0
mysql_databases: [{ name: appdb }]
mysql_users: [{ name: app, password: "{{ vault_mysql_app_password }}", priv: "appdb.*:ALL", host: "10.0.%" }]

# roles/mysql/tasks/main.yml
- name: Install MySQL server and Python driver
  ansible.builtin.package:
    name: [mysql-server, python3-PyMySQL]
    state: present
- name: Configure mysqld
  ansible.builtin.template:
    src: my.cnf.j2
    dest: /etc/my.cnf.d/server.cnf
  notify: restart mysql
- name: Ensure service is running
  ansible.builtin.service: { name: mysqld, state: started, enabled: true }
- name: Create databases
  community.mysql.mysql_db:
    name: "{{ item.name }}"
    state: present
    login_unix_socket: /var/lib/mysql/mysql.sock
  loop: "{{ mysql_databases }}"
- name: Create users
  community.mysql.mysql_user:
    name: "{{ item.name }}"
    password: "{{ item.password }}"
    priv: "{{ item.priv }}"
    host: "{{ item.host }}"
    state: present
    login_unix_socket: /var/lib/mysql/mysql.sock
  loop: "{{ mysql_users }}"
  no_log: true

# roles/mysql/handlers/main.yml
- name: restart mysql
  ansible.builtin.service: { name: mysqld, state: restarted }
```

Package and service names differ by distribution (`mysql-server`/`mysqld` on RHEL, `mysql-server`/`mysql` on Debian). Handle that with variables per OS family. Setting the root password depends on the distribution's default auth (socket against password).

**Jenkins roles and user management.** SSO (LDAP, SAML, OIDC) for authentication, and the **Role-based Authorization Strategy** plugin (or Matrix) for authorisation: global roles (admin, read-only), item roles by job regex or folder (team-a can build `team-a/*`), agent roles. Manage with Configuration as Code (JCasC) and the least privilege principle. No anonymous access.

**CloudFront: its use, and how a company like Paytm reduces latency (for example image load time).** CloudFront caches content at **edge locations** close to users, so images load from a nearby PoP instead of the origin: lower latency, less origin load, TLS at the edge, HTTP/2 and HTTP/3. For images also: long `Cache-Control` max-age with versioned file names, compression and modern formats (WebP/AVIF, with on-the-fly resizing through Lambda@Edge or an image service), Origin Shield to cut origin fetches, and preconnect hints.

**How to debug a REST API error (for example 404 or 503).** **404**: wrong path or method or version, routing rules in the load balancer or API gateway or ingress (path rewrite, prefix stripping), the resource really doesn't exist, the wrong host header or virtual host. **503**: no healthy backends or endpoints, overload or throttling, maintenance mode. Use `curl -v` to see which layer answers (the `Server` header, response body format), access logs at each hop, and health checks. → [Core: 5xx](../core-answers.md#http-5xx)

**Tomcat and Apache integration.** Apache httpd as the front-end reverse proxy (TLS, static files, load balancing) forwarding to Tomcat through **mod_proxy_ajp** (AJP on port 8009, which needs a `secret` since the Ghostcat CVE) or **mod_proxy_http** (HTTP to 8080, simpler and now preferred). For example `ProxyPass /app http://localhost:8080/app` and `ProxyPassReverse`, plus `mod_proxy_balancer` for several Tomcats with sticky sessions (`jvmRoute`).

**Python for containers: which libraries, and its role in automation.** The Docker SDK (`docker` package: build, run, inspect containers), the official `kubernetes` Python client (CRUD on resources, watches, writing operators with **kopf**), `boto3` for ECS/EKS/ECR, Fabric or Invoke for task automation, and testing with `pytest` and testcontainers. Python is used for deployment scripts, custom controllers, health checks, cleanup jobs and glue in pipelines.

**Python code to put an object in S3 and set the bucket policy from JSON.**

```python
import json
import boto3

s3 = boto3.client("s3")
bucket = "my-example-bucket"

# 1) Upload an object (server-side encryption on)
s3.put_object(Bucket=bucket, Key="reports/hello.txt", Body=b"hello",
              ServerSideEncryption="aws:kms")

# 2) Apply a bucket policy from a JSON file
with open("bucket-policy.json") as f:
    policy = json.load(f)
s3.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))

# 3) Verify
print(json.loads(s3.get_bucket_policy(Bucket=bucket)["Policy"]))
```

Block Public Access will reject a policy that grants public access, which is intentional.
