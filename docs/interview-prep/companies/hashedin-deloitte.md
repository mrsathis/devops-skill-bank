---
tags:
  - interview
---

# HashedIn by Deloitte: DevOps Engineer

Round 1 was an online multiple-choice assessment (Linux commands and scripting, network security and protocols, Git strategies, deployment strategies). The questions below are from the technical rounds.

## Round 2: Technical 1

**What is a Kubernetes Operator? What is a CRD? What is a custom controller? Explain Operator architecture.**

- A **CRD** (CustomResourceDefinition) extends the Kubernetes API with a new resource type (for example `kind: PostgresCluster`), with a schema. The API server stores and serves it like a built-in object.
- A **custom controller** is a process that **watches** resources (through informers and caches) and runs a **reconcile loop**: read the desired state from the spec, compare it with actual state, act to converge, and write status. It's level-triggered and idempotent.
- An **Operator** = CRD(s) + controller(s) that encode operational knowledge for an application (install, upgrade, backup, failover). Examples: Prometheus Operator, CloudNativePG, cert-manager.
- Architecture: the controller runs as a Deployment with RBAC, uses leader election, work queues with rate-limited requeues, owner references and finalisers. Built with Kubebuilder or Operator SDK.

**What are API groups in Kubernetes?** A way to version and organise the API: the core group (`/api/v1`: Pods, Services, ConfigMaps) and named groups (`/apis/apps/v1` for Deployments, `batch/v1`, `networking.k8s.io/v1`, plus CRD groups). They're shown in `apiVersion` and listed with `kubectl api-resources`. Groups let parts of the API evolve and be deprecated on their own (v1alpha1 → v1beta1 → v1).

**What is etcd?** → [Core: architecture](../core-answers.md#k8s-architecture). A distributed key-value store using Raft, which needs a majority (quorum) to write.

**Explain the OSI model layers and their significance.** → [Core: OSI](../core-answers.md#osi)

**Difference between HTTP and HTTPS?** HTTPS is HTTP over **TLS**, which gives encryption (confidentiality), integrity and server authentication through certificates. HTTP uses port 80, HTTPS 443. HTTPS is required for modern browser features and HTTP/2 in practice. → [Core: TLS](../core-answers.md#tls)

**What is DNS? What is recursive DNS? What happens when you hit www.hashedin.com?** → [Core: DNS](../core-answers.md#dns) and [URL flow](../core-answers.md#url-flow)

**Explain the Git lifecycle from cloning to pushing, and the Git architecture.** `git clone` → edit in the **working directory** → `git add` to the **staging area (index)** → `git commit` to the **local repository** (`.git`: objects are blobs, trees and commits addressed by SHA, refs point to commits) → `git push` to the **remote**. `git fetch`/`pull` brings remote changes. Git is distributed: every clone has the full history in `.git`.

**What is a kernel? Is Linux an OS or a kernel?** The kernel is the core that manages CPU scheduling, memory, devices (drivers), filesystems, networking and system calls between hardware and user programs. **Linux is technically the kernel.** A full OS (a "distribution" such as Ubuntu or RHEL) is the Linux kernel plus GNU user-space tools, libraries, an init system and package management. That's why some people say "GNU/Linux".

**Write ten Linux commands and explain them.** `ls -la` (list with permissions), `cd`, `grep -rn "error" /var/log` (search), `find / -name "*.log" -size +100M`, `ps aux` (processes), `top` (live resource use), `df -h` / `du -sh` (disk), `chmod 640 file` / `chown user:group file` (permissions), `systemctl status nginx` (services), `journalctl -u nginx -f` (logs), `ss -tulpn` (listening ports), `curl -I url` (HTTP test), `tail -f`.

**Virtualisation vs containerisation?** VMs virtualise **hardware**: a hypervisor runs full guest OSes, each with its own kernel, giving strong isolation, heavier weight, and boot times in minutes. Containers virtualise the **OS**: processes share the host kernel and are isolated with namespaces and cgroups. They're lightweight and start in seconds, with weaker isolation (the kernel is shared). Often combined: containers inside VMs, or micro-VMs such as Firecracker.

**Which Linux features make Docker work?** **Namespaces** (pid, net, mnt, uts, ipc, user, cgroup) for isolation, **cgroups** for resource limits and accounting, **union or overlay filesystems** (overlayfs) for layered images, **capabilities**, **seccomp** and AppArmor or SELinux for security, and **veth pairs, bridges and iptables** for networking. → [Core: docker run](../core-answers.md#docker-run)

**What is the Docker daemon? Explain Docker architecture and lifecycle.** **dockerd** is the background service that manages images, containers, networks and volumes. It exposes a REST API (a Unix socket) used by the **Docker CLI**, and delegates running containers to containerd → runc. Registries store images. Container lifecycle: `create` → `start` (running) → `pause`/`unpause` → `stop` (SIGTERM then SIGKILL after a timeout) → `rm`. Image lifecycle: `build`/`pull` → `tag` → `push`.

**Write five Docker commands and explain them.** `docker build -t app:1.0 .`, `docker run -d -p 8080:80 --name web app:1.0`, `docker ps -a`, `docker logs -f web`, `docker exec -it web sh`, `docker inspect web`, `docker images` / `docker rmi`, `docker push registry/app:1.0`.

**Write a Jenkins pipeline that builds and pushes a Docker image.**

```groovy
pipeline {
  agent { label 'docker' }
  environment {
    IMAGE = "registry.example.com/team/app"
    TAG   = "${env.GIT_COMMIT.take(7)}"
  }
  stages {
    stage('Build') {
      steps { sh 'docker build -t $IMAGE:$TAG .' }
    }
    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'registry-creds',
                         usernameVariable: 'USER', passwordVariable: 'PASS')]) {
          sh 'echo "$PASS" | docker login registry.example.com -u "$USER" --password-stdin'
          sh 'docker push $IMAGE:$TAG'
        }
      }
    }
  }
  post { always { sh 'docker logout registry.example.com || true' } }
}
```

**What are namespaces in Kubernetes?** Virtual partitions of a cluster for grouping and isolating resources (teams, environments). Names must be unique within a namespace. RBAC, ResourceQuotas, LimitRanges and NetworkPolicies apply per namespace. Some resources are cluster-scoped (Nodes, PVs, StorageClasses, ClusterRoles). Default namespaces: `default`, `kube-system`, `kube-public`, `kube-node-lease`.

**Write a Pod spec for an NGINX server.**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
  labels: { app: nginx }
spec:
  containers:
    - name: nginx
      image: nginx:1.27
      ports: [{ containerPort: 80 }]
      resources:
        requests: { cpu: 100m, memory: 64Mi }
        limits:   { memory: 128Mi }
```

**What is a VPC? Public vs private subnets? NAT Gateway vs Internet Gateway? Can a NAT Gateway be in a private subnet? How do private instances reach the internet?** → [Core: VPC](../core-answers.md#vpc-basics) and [NAT](../core-answers.md#nat-gateway). A *public* NAT gateway must be in a public subnet (it needs a route to the IGW). AWS also has **private NAT gateways**, which can sit in private subnets for private-to-private translation (for example overlapping CIDRs through a TGW), but those can't reach the internet.

**Terraform lifecycle commands; what is the state file; managing state in a team.** → [Core: commands](../core-answers.md#tf-commands) and [state](../core-answers.md#tf-state)

## Round 3: Technical 2

**Write a simple Dockerfile.**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER 1000
EXPOSE 8000
CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]
```

**Explain the Docker workflow.** Write a Dockerfile → `docker build` (image) → `docker tag`/`push` to a registry → `docker pull` and `run` on the target (or let Kubernetes or ECS pull it) → monitor, update by building a new tag.

**Why must etcd be highly available?** etcd holds *all* cluster state. If it loses quorum, the API server can't write (and may not be able to read consistently), so no scheduling, scaling, deployments or self-healing changes happen, although running pods keep running. Data loss without backups means rebuilding the cluster. So run 3 or 5 members across failure domains (odd numbers for quorum), on fast disks (etcd is latency-sensitive), with regular snapshots (`etcdctl snapshot save`).

**What happens when you hit a website URL?** → [Core: URL flow](../core-answers.md#url-flow)

**What is an SSL certificate?** → [Core: TLS](../core-answers.md#tls)

**Explain the role of NAT in AWS.** → [Core: NAT](../core-answers.md#nat-gateway)

**S3 buckets vs EBS volumes?** **S3** is regional **object storage** over an HTTP API, practically unlimited, 11 nines of durability, accessible from anywhere with permissions. It's for files, backups, static sites and data lakes. **EBS** is **block storage** attached to one EC2 instance in one AZ (Multi-Attach only for io1/io2 in limited cases), formatted with a filesystem, low latency. It's for OS disks and databases.

**AMI vs snapshot?** A **snapshot** is a point-in-time incremental backup of one EBS volume, stored in S3 (AWS-managed). An **AMI** is a launchable machine image: one or more snapshots (root and data volumes) plus metadata (architecture, virtualisation type, block device mapping, launch permissions). You create an AMI to launch identical instances, and a snapshot to back up or restore a volume.

**Explain remote state locking in Terraform.** → [Core: state](../core-answers.md#tf-state)

**MySQL vs MongoDB; what is a relational database; what is a primary key?** A **relational** database stores data in tables with rows and columns, a fixed schema, relationships through foreign keys, SQL and ACID transactions (MySQL, PostgreSQL). **MongoDB** is a **document** (NoSQL) database that stores JSON-like BSON documents with flexible schemas, and scales horizontally by sharding. It also supports multi-document transactions now. A **primary key** uniquely identifies each row: it's unique, not null, one per table, and indexed automatically.

## Round 4: Fitment

Team or individual work, work-life balance, ideal manager, WFH or office, why HashedIn, competing offers. Answer honestly and consistently, connect to the company's culture, and show you want to grow there. → [Core: behavioural](../core-answers.md#behavioural)
