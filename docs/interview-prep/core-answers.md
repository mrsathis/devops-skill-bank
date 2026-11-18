---
tags:
  - interview
---

# Core answers

These are the questions that came up again and again across the saved interview posts, at many
different companies. Each is answered once here, and the company and topic pages link back to it.

!!! tip "How to use these in an interview"
    Lead with the mechanism, then the order you'd check things in, then the fix and how you'd
    prevent it next time. Interviewers listen for *how you think*, not for a memorised list.

---

## Kubernetes

### Kubernetes architecture {#k8s-architecture}

**Control plane**

- **kube-apiserver**: the only component that talks to etcd. Every client (kubectl, kubelet, controllers) goes through it. It handles authentication, authorization (RBAC), admission control (mutating, then validating webhooks) and validation, then persists objects.
- **etcd**: a consistent, distributed key-value store (Raft consensus) holding the whole cluster state. Run 3 or 5 members so the cluster keeps quorum when one fails, and back it up.
- **kube-scheduler**: watches for pods with no `nodeName` and picks a node in two phases. *Filtering* removes nodes that can't fit the pod (resources, taints, node selectors and affinity, volume topology). *Scoring* ranks the rest (spread, image locality, balanced utilisation). It then *binds* the pod to the winner.
- **kube-controller-manager**: runs the reconciliation loops: Deployment, ReplicaSet, Node, Job, EndpointSlice, ServiceAccount and others. Each one compares desired state with actual state and acts to close the gap.
- **cloud-controller-manager**: the cloud-specific loops: load balancers for `type: LoadBalancer`, node lifecycle, routes.

**Worker nodes**

- **kubelet**: registers the node, watches for pods bound to it, asks the container runtime (via CRI) to start them, runs the probes and reports status.
- **Container runtime**: containerd or CRI-O. It pulls images and creates containers using Linux namespaces and cgroups.
- **kube-proxy**: programs iptables or IPVS rules so traffic to a Service ClusterIP reaches a backend pod. eBPF CNIs such as Cilium can replace it.
- **CNI plugin**: gives each pod an IP and connects it to the pod network.

### What happens when you run `kubectl apply` {#kubectl-apply-flow}

1. kubectl reads the manifest and computes a patch (client-side apply, or server-side apply with field ownership), then sends it to the API server.
2. The API server authenticates and authorises the request, runs admission webhooks, validates the object and writes it to etcd.
3. The Deployment controller sees the new or changed Deployment and creates or updates a ReplicaSet. The ReplicaSet controller creates Pod objects.
4. The scheduler assigns each pod to a node.
5. The kubelet on that node calls the CNI to set up networking, pulls the image, starts the containers and runs the probes.
6. When readiness passes, the pod's IP is added to the Service's EndpointSlice and kube-proxy or the CNI starts sending it traffic.

### CrashLoopBackOff {#crashloopbackoff}

The container starts, exits, and the kubelet restarts it with an exponential back-off (10s, 20s, 40s… capped at 5 minutes).

```bash
kubectl describe pod <pod> -n <ns>        # Last State, Reason, Exit Code, Events
kubectl logs <pod> -n <ns> --previous     # logs from the crashed container
kubectl get events -n <ns> --sort-by=.lastTimestamp
```

Read the **exit code** first:

| Exit code | Meaning | Typical cause |
|---|---|---|
| 1 / 2 | Application error | Bad config, missing env var or secret, failed DB connection, bad arguments |
| 126 / 127 | Command not executable / not found | Wrong `command`/`args`, missing binary in the image |
| 137 | SIGKILL | OOMKilled (check `Reason: OOMKilled`) or killed after a failed liveness probe |
| 143 | SIGTERM | Graceful stop, often from a failing liveness probe |
| 0 | Clean exit | The main process finished: no long-running foreground process |

Other common causes: a liveness probe that is too aggressive (no startup probe for a slow-starting app), a ConfigMap or Secret change, a dependency that isn't reachable, or file permissions when running as non-root. If the image has no shell, use `kubectl debug -it <pod> --image=busybox --target=<container>`. Fix the cause and redeploy, or `kubectl rollout undo` if a release caused it.

### ImagePullBackOff / ErrImagePull {#imagepullbackoff}

The kubelet can't pull the image. `kubectl describe pod` shows the exact registry error.

- **Wrong name or tag**, or the tag was deleted. Check it exists in the registry.
- **Authentication**: missing or wrong `imagePullSecrets`. On EKS, the node role needs ECR pull permissions (`AmazonEC2ContainerRegistryReadOnly`).
- **Network**: nodes in private subnets need a NAT gateway or VPC endpoints (for ECR: `ecr.api`, `ecr.dkr` and an S3 gateway endpoint). A proxy or firewall can also block it.
- **Rate limits** (Docker Hub), or a registry outage.
- **Platform mismatch**: for example an arm64-only image on amd64 nodes.
- **Node disk pressure**: no space to unpack layers.

Reproduce from the node with `crictl pull <image>` to separate network from authentication.

### Pod stuck in Pending {#pending-pods}

Pending means the pod hasn't been scheduled, or is scheduled but waiting for a volume. The Events at the bottom of `kubectl describe pod` tell you which.

- **Insufficient CPU or memory**: the scheduler compares *requests*, not actual usage, against allocatable capacity. Fix by right-sizing requests or adding nodes (Cluster Autoscaler or Karpenter).
- **Taints with no matching toleration**, or a `nodeSelector`/affinity that matches no node.
- **Pod anti-affinity or topology spread** rules that can't be met.
- **PVC not bound**: no StorageClass, the CSI driver isn't running, the volume is in a different AZ from the available nodes (use `volumeBindingMode: WaitForFirstConsumer`), or the storage quota is reached.
- **ResourceQuota or LimitRange** in the namespace rejecting it.
- **No free IP addresses**: on EKS with the VPC CNI, each node has a pod limit tied to its ENIs and IPs, and a subnet can run out of addresses. This usually shows as `ContainerCreating` with "failed to assign an IP address".
- **Too many pods** on the node (`max-pods`).

### OOMKilled {#oomkilled}

The container used more memory than its **limit**, and the kernel's cgroup OOM killer ended it (exit code 137, `Reason: OOMKilled`). This is different from node-level eviction under memory pressure, which follows QoS class (BestEffort pods go first, then Burstable, then Guaranteed).

1. Confirm with `kubectl describe pod` and check memory usage over time (`container_memory_working_set_bytes` against the limit).
2. Decide whether the limit is too small for normal load or memory is leaking (usage rises steadily until it's killed). An OOM that repeats on a fixed schedule usually points to a cron job, a batch spike or a sidecar.
3. Check runtime settings. A JVM must size its heap from the container limit (`-XX:MaxRAMPercentage`). Node.js has `--max-old-space-size`.
4. Fix it: right-size the limit from observed peaks plus headroom, fix the leak (take heap dumps or profile), or use VPA to get recommendations.

### Readiness, liveness and startup probes {#probes}

| Probe | Question it answers | What happens when it fails |
|---|---|---|
| **Startup** | Has the app finished starting? | The other probes are paused until it succeeds. If it fails past `failureThreshold × periodSeconds`, the container is restarted |
| **Liveness** | Is the process stuck? | The kubelet **restarts** the container |
| **Readiness** | Can it take traffic right now? | The pod is **removed from Service endpoints**. It is *not* restarted |

The startup probe runs first. Liveness and readiness then run in parallel for the life of the container. Good practice:

- Liveness checks only the process itself. Never put dependencies (the database) in a liveness check, or a database blip will restart every pod and make things worse.
- Readiness can reflect whether the pod can serve: dependencies, warm caches.
- Use a startup probe for slow starters instead of a huge `initialDelaySeconds`.

### Deployment vs StatefulSet vs DaemonSet {#workload-types}

| | Deployment | StatefulSet | DaemonSet |
|---|---|---|---|
| Pod identity | Interchangeable, random names | Stable, ordered names (`db-0`, `db-1`) and stable DNS via a headless Service | One pod per (matching) node |
| Storage | Shared or none | `volumeClaimTemplates` give each replica its own PVC, which stays when the pod moves | Usually hostPath or none |
| Rollout | Rolling, any order | Ordered (reverse ordinal), or `partition` for staged rollouts | Node by node |
| Use for | Stateless APIs and web apps | Databases, Kafka, ZooKeeper, anything needing stable identity | Log shippers, node exporters, CNI agents, CSI drivers |

Databases use StatefulSets because each replica needs its *own* persistent disk and a stable network identity for replication and leader election. A Deployment's pods would share a PVC or lose their data when rescheduled.

### Service types and Ingress {#services-ingress}

- **ClusterIP** (default): a virtual IP reachable only inside the cluster.
- **NodePort**: opens a port (30000–32767) on *every* node and forwards it to the Service.
- **LoadBalancer**: asks the cloud for an external load balancer (on AWS, an NLB through the AWS Load Balancer Controller) that points at the nodes or directly at pod IPs.
- **ExternalName**: a DNS CNAME to an outside name. No proxying.
- **Headless** (`clusterIP: None`): no virtual IP. DNS returns the individual pod IPs. Used with StatefulSets so clients can reach `db-0.db.ns.svc.cluster.local` directly.

An **Ingress** is an L7 (HTTP/HTTPS) routing rule set: host and path based routing and TLS termination, served by an Ingress controller (NGINX, AWS Load Balancer Controller creating an ALB, Traefik). One load balancer can serve many Services. The Gateway API is the newer successor. Rule of thumb: a Service gives you a stable address for a set of pods, and an Ingress exposes many HTTP services behind one entry point.

### Request flow: DNS → load balancer → Ingress → Service → Pod {#k8s-request-flow}

1. The client resolves `app.example.com` through DNS (for example a Route 53 alias) to the load balancer.
2. The load balancer (an ALB, or an NLB in front of an ingress controller) terminates TLS or passes it through, and forwards to its targets: node ports, or pod IPs in IP mode.
3. The Ingress controller matches host and path to a backend Service.
4. The Service resolves to ready pod IPs from its EndpointSlice. kube-proxy (iptables or IPVS) or the eBPF CNI picks one and DNATs to it.
5. The packet reaches the pod over the CNI network, and the container answers on its `targetPort`.

Inside the cluster, pods find each other through CoreDNS: `svc.namespace.svc.cluster.local` resolves to the ClusterIP.

### Pods running but users get 503 {#pods-running-503}

503 means the proxy has no healthy upstream to send to. Check in this order:

1. `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`. Empty means the Service `selector` doesn't match the pod labels, or the pods aren't Ready.
2. `targetPort` doesn't match the port the container listens on, or the app listens on `127.0.0.1` instead of `0.0.0.0`.
3. The Ingress points at the wrong Service name or port, or the ingress controller's own health check fails.
4. Load balancer target health: security groups between the load balancer and nodes or pods, or a health-check path that returns non-200.
5. The app returns 503 itself because a downstream dependency or circuit breaker is open: check its logs.
6. During deploys: missing readiness probes, or no `preStop` delay, sends traffic to pods that are still starting or already terminating.

### Rolling update, `maxSurge` and `maxUnavailable` {#rolling-update}

A RollingUpdate creates a new ReplicaSet and shifts pods across gradually.

- `maxSurge`: how many pods *above* the desired count may exist during the rollout (default 25%).
- `maxUnavailable`: how many pods *below* the desired count may be unavailable (default 25%).

`maxSurge: 1, maxUnavailable: 0` gives a zero-capacity-loss rollout, one extra pod at a time. New pods only count as available after passing readiness (plus `minReadySeconds`). If they never pass, the rollout stalls and after `progressDeadlineSeconds` it's marked failed, but the old pods keep serving. Useful commands: `kubectl rollout status`, `history`, `undo`, `pause` and `resume`. The **Recreate** strategy kills all old pods before starting new ones, which means downtime, but is required when two versions can't run at the same time.

### Deployment strategies: rolling, blue-green, canary {#deployment-strategies}

| Strategy | How | Pros | Cons |
|---|---|---|---|
| Rolling | Replace pods gradually | Built in, no extra capacity | Both versions run together, rollback is another rollout |
| Blue-green | Run the full new stack (green) next to the old (blue), then switch traffic at once (Service selector, load balancer target group or DNS) | Instant switch and instant rollback, test green before the switch | Double capacity, database schema must work for both versions |
| Canary | Send a small share of traffic (1%, 5%, 25%…) to the new version and watch metrics | Smallest blast radius, decisions based on real data | Needs traffic splitting (Istio, Argo Rollouts, ALB weighted target groups) and good metrics |

With **blue-green**, during the switch already-open connections finish on blue (connection draining or deregistration delay) while new requests go to green. Keep blue running until green is proven so you can switch back. For high-traffic services, canary with automated analysis (error rate and latency against the baseline) is the safer choice.

### Zero-downtime deployments {#zero-downtime}

- Readiness probes, so pods only get traffic when ready.
- `maxUnavailable: 0` and enough replicas, plus a PodDisruptionBudget.
- Graceful shutdown: handle SIGTERM, add a `preStop` sleep of a few seconds so endpoints and load balancers stop routing *before* the app stops, and set `terminationGracePeriodSeconds` longer than the longest request.
- Backward-compatible database migrations using **expand and contract**: add new columns or tables first, deploy code that works with both, migrate the data, then remove the old parts in a later release.
- Load balancer deregistration delay matched to the shutdown time.
- Progressive delivery (canary or blue-green) with automated rollback on SLO breach.

### Horizontal Pod Autoscaler (HPA) {#hpa}

Every 15 seconds by default, the HPA controller reads metrics from the Metrics API (metrics-server for CPU and memory, or a Prometheus Adapter or KEDA for custom and external metrics) and computes:

`desiredReplicas = ceil(currentReplicas × currentMetricValue / targetValue)`

CPU utilisation is measured **as a percentage of the pod's CPU request**. Scale-down waits for a stabilisation window (300 seconds by default) to prevent flapping.

**Why an HPA doesn't scale even though CPU looks high:**

- Pods have **no CPU requests**, so utilisation can't be computed (`kubectl describe hpa` shows `<unknown>`).
- metrics-server is down or lagging, or the custom metrics adapter is broken. Check `kubectl top pods` and `kubectl get apiservice v1beta1.metrics.k8s.io`.
- The HPA is already at `maxReplicas`.
- Prometheus shows CPU against the *limit* or the node, while the HPA computes it against the *request*.
- The new pods are Pending because the cluster is out of capacity. That's a node-autoscaler problem, not an HPA problem.
- Behaviour policies or stabilisation windows are limiting the rate.
- With several containers in a pod, the sidecar's request is included in the average.

### Cluster Autoscaler vs Karpenter vs HPA {#node-autoscaling}

The **HPA** changes the number of *pods*. Node autoscalers change the number of *nodes*, and they react to **Pending pods**, not to CPU.

- **Cluster Autoscaler** scales existing node groups (ASGs) up when pods can't be scheduled, and down when nodes are underused and their pods fit elsewhere (respecting PDBs).
- **Karpenter** (EKS) skips node groups. It looks at the Pending pods' requirements, launches the cheapest instance types that fit straight from EC2, and consolidates later by replacing or removing underused nodes. It is faster and more cost-efficient, and works well with Spot.
- **VPA** changes pod *requests* (vertical sizing). Don't let HPA and VPA both act on CPU for the same workload.

### What happens when a worker node goes down {#node-down}

1. The kubelet stops sending heartbeats (Lease objects). After about 40–50 seconds the node controller marks the node `NotReady` and adds the `node.kubernetes.io/unreachable` taint.
2. Pods have a default toleration of 300 seconds for that taint. After it expires they are evicted, and the ReplicaSet creates replacements on healthy nodes.
3. **StatefulSet** pods are *not* replaced automatically while the old pod might still be running (to avoid two writers). You delete the node or pod, or use the non-graceful shutdown taint. EBS volumes must detach from the dead node (around 6 minutes) before they can attach elsewhere.
4. To reduce the impact: run several replicas spread across nodes and AZs (topology spread or anti-affinity), set PDBs, and have the node autoscaler replace capacity.

### PodDisruptionBudget (PDB) {#pdb}

A PDB limits **voluntary** disruptions (drain, node upgrades, Cluster Autoscaler or Karpenter consolidation) with `minAvailable` or `maxUnavailable` for a label selector. The eviction API refuses to evict pods if that would breach the budget, so `kubectl drain` waits. It does **not** protect against involuntary failures such as a node crash. Beware a PDB with `minAvailable` equal to the replica count: it blocks drains and upgrades forever.

### Taints, tolerations, cordon and drain {#taint-cordon-drain}

- **Taint** (on a node) repels pods without a matching **toleration**. Effects: `NoSchedule`, `PreferNoSchedule`, and `NoExecute` (which also evicts running pods). Used for dedicated nodes such as GPU or system nodes.
- **Cordon** (`kubectl cordon`) marks a node unschedulable. Existing pods keep running.
- **Drain** (`kubectl drain --ignore-daemonsets --delete-emptydir-data`) cordons the node and then *evicts* pods (respecting PDBs) so they move to healthy nodes.

To move workloads off an unhealthy node: cordon it, drain it, investigate, then uncordon it or replace it.

### Upgrading a Kubernetes or EKS cluster with zero downtime {#cluster-upgrade}

1. **Before you start**: read the release notes and find removed APIs (`kubent`, `pluto`, or EKS Upgrade Insights). Check add-on compatibility (CNI, CoreDNS, kube-proxy, CSI drivers, ingress controller, cert-manager) and make sure every app has several replicas, PDBs and readiness probes. Back up etcd if self-managed (EKS manages that), and rehearse in a non-prod cluster.
2. **Control plane**: one minor version at a time (1.34 → 1.35). On EKS this is `aws eks update-cluster-version` or a Terraform change. The API stays available.
3. **Add-ons**: update the VPC CNI, CoreDNS and kube-proxy to versions that match.
4. **Data plane**: managed node groups do a rolling update (new nodes, then cordon, drain and terminate old ones). With Karpenter, update the AMI or node class and let drift replace nodes. Alternatively, create a new node group, move workloads over and delete the old one (blue-green nodes). The kubelet can lag the API server by a few minor versions but should never be newer.
5. **Verify**: workloads healthy, error rates and SLOs unchanged. Keep the old node group for a quick rollback of the data plane. The control plane can't be downgraded.

### ConfigMaps and Secrets {#configmaps-secrets}

Both inject configuration as environment variables or mounted files. Secrets are only **base64-encoded**, not encrypted, so:

- Turn on encryption at rest in etcd (on EKS, envelope encryption with KMS).
- Restrict access with RBAC (`get`/`list` on secrets is powerful).
- Better still, keep secrets in an external store (AWS Secrets Manager, Vault, Azure Key Vault) and sync them with the External Secrets Operator or the Secrets Store CSI driver, or use Vault agent injection.
- Never commit raw Secret YAML. Use Sealed Secrets or SOPS if they must live in Git.

Config changes: mounted files update eventually (not with `subPath`). Environment variables only change when the pod restarts. Use a checksum annotation in Helm or Reloader to roll pods on change.

### Securing a Kubernetes cluster {#k8s-security}

- **API access**: private endpoint or restricted CIDRs, SSO/OIDC authentication, least-privilege RBAC, no shared cluster-admin.
- **Workloads**: Pod Security Admission (`restricted`), run as non-root, read-only root filesystem, drop capabilities, seccomp `RuntimeDefault`, no privileged containers or hostPath.
- **Network**: default-deny NetworkPolicies, then allow specific flows. mTLS through a service mesh where needed.
- **Supply chain**: scan images in CI and in the registry (Trivy, ECR scanning), sign images (cosign) and verify them at admission (Kyverno or Gatekeeper), allow only trusted registries.
- **Secrets**: encryption at rest, external secret stores, workload identity (IRSA or EKS Pod Identity, Azure Workload Identity, GKE Workload Identity) instead of static keys.
- **Runtime and audit**: Falco or GuardDuty EKS Runtime Monitoring, API audit logs, and patched nodes and control plane.

### Helm basics {#helm}

- A **chart** is a package of templated manifests: `Chart.yaml` (metadata, version, dependencies), `values.yaml` (defaults), `templates/` (Go templates plus `_helpers.tpl`), `charts/` (subcharts) and optionally `values.schema.json`.
- A **release** is one installed instance of a chart in a cluster, with its own revision history stored as Secrets.
- Commands: `helm install|upgrade --install <release> <chart> -f values-prod.yaml --set image.tag=1.2.3`, `helm diff upgrade` (plugin), `helm rollback <release> <revision>`, `helm history`, `helm template` to render locally, `helm lint`.
- Precedence of values: later `-f` files override earlier ones, and `--set` overrides files.
- `range` loops over lists and maps in templates. For example, to create several env vars from a values list: `{{- range .Values.env }}- name: {{ .name }}{{ end }}`.

---

## Docker and containers

### What happens when you run `docker run` {#docker-run}

1. The CLI sends the request to the Docker daemon (dockerd) through its REST API.
2. If the image isn't local, dockerd pulls the manifest and layers from the registry.
3. dockerd asks containerd to create the container. containerd uses runc (an OCI runtime) through a shim.
4. runc creates the **namespaces** (pid, net, mnt, uts, ipc, user), applies **cgroups** limits, sets up the root filesystem as an **overlay** of the read-only image layers plus a new writable layer, applies seccomp and capabilities, and `exec`s the entrypoint as PID 1.
5. Networking: a veth pair connects the container to the `docker0` bridge (or a user-defined network), with NAT and iptables rules for published ports.

### Image vs container, and layers {#image-vs-container}

An **image** is an immutable, layered filesystem plus metadata (entrypoint, environment, exposed ports). A **container** is a running instance of an image: the same read-only layers plus a thin writable layer, its own namespaces and cgroups, and a process. Each Dockerfile instruction that changes the filesystem (`RUN`, `COPY`, `ADD`) creates a layer. Layers are content-addressed and cached, so builds reuse unchanged layers *until the first changed instruction*. That's why you copy `package.json` and install dependencies **before** copying source code. Data written to the writable layer is lost when the container is removed. Use volumes for anything you need to keep.

### Multi-stage builds {#multi-stage}

Several `FROM` stages in one Dockerfile: build in a full SDK image, then copy only the output into a minimal runtime image.

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/target/*.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

The final image has no compilers, build tools or source code: smaller, faster to pull, and less to attack.

### Making a large image smaller (2–3 GB) {#image-size}

1. Multi-stage build, so only runtime files reach the final stage.
2. A small base: `-slim`, `-alpine` (watch out for musl compatibility) or distroless.
3. A `.dockerignore` (`.git`, `node_modules`, test data, local builds).
4. Combine install and cleanup in one `RUN` (`apt-get install --no-install-recommends … && rm -rf /var/lib/apt/lists/*`), because a file deleted in a later layer is still in the earlier one.
5. Install production dependencies only (`npm ci --omit=dev`, `pip install --no-cache-dir`).
6. Don't bake data, models or artefacts into the image. Mount or download them at runtime.
7. Inspect with `docker history` or `dive` to find the big layers.

### CMD vs ENTRYPOINT vs RUN {#cmd-entrypoint}

- `RUN` executes at **build** time and creates a layer.
- `ENTRYPOINT` is the executable that always runs. `CMD` gives default arguments (or the default command if there's no ENTRYPOINT).
- `docker run image args` **replaces CMD**. Replacing ENTRYPOINT needs `--entrypoint`.
- Use the exec form (`["app","--flag"]`) so the process is PID 1 and receives signals. The shell form wraps it in `/bin/sh -c`, which doesn't forward SIGTERM.

Pattern: `ENTRYPOINT ["python","job.py"]` with `CMD ["--mode","daily"]`, so a batch job can override only the arguments at run time. In ECS or Kubernetes, override them with `command`/`args` in the task or pod definition.

### COPY vs ADD {#copy-vs-add}

`COPY` copies files from the build context, and that's all. `ADD` also auto-extracts **local** tar archives and can fetch remote URLs (without extracting those). Prefer `COPY` because it is explicit and predictable. Use `ADD` only to unpack a local tarball, for example `ADD rootfs.tar.gz /`.

### A container that keeps restarting or exits immediately {#container-restarts}

1. `docker ps -a` for the exit code, `docker logs <id>`, and `docker inspect <id>` (`State.ExitCode`, `OOMKilled`, `Health`).
2. Exit code 0 means the main process finished. A container lives only as long as PID 1, so a daemon that forks into the background ends the container. Run the process in the foreground.
3. Exit code 137 means OOM or killed. 1 is an app error. 127 is a command not found.
4. Missing environment variables, secrets or config files. A dependency that isn't reachable. Permissions when running as non-root.
5. A failing health check combined with a restart policy or orchestrator.
6. Debug interactively: `docker run -it --entrypoint sh <image>`.

### Volumes vs bind mounts, and where data goes {#docker-storage}

Container data in the writable layer is deleted with the container. **Volumes** are managed by Docker (`/var/lib/docker/volumes`), portable, and the right choice for databases and persistent data. **Bind mounts** map a host path into the container. They're handy for local development and config, but tie you to the host's layout. **tmpfs** mounts keep data in memory only.

### Docker networking {#docker-networking}

- **bridge** (default): containers on a private bridge with NAT out. On the *default* bridge, containers reach each other by IP only.
- **User-defined bridge**: adds DNS by container name and better isolation. Use it so `app` can reach `mysql:3306`.
- **host**: shares the host's network stack. No isolation, no port mapping, best performance.
- **none**: no networking. **overlay**: multi-host (Swarm). **macvlan**: the container appears as a device on the physical network.

`EXPOSE 80` is documentation only. `-p 8080:80` actually publishes host port 8080 to container port 80.

If an app container can't reach MySQL: are they on the same user-defined network? Is it using the service name (not `localhost`)? Is MySQL listening on `0.0.0.0` and ready yet (use a healthcheck with `depends_on: condition: service_healthy`)? Are the credentials right?

### Secrets in containers {#container-secrets}

Never put secrets in the image (`ENV`, `ARG`, or files copied in). They stay in the layer history. Instead: inject at runtime from a secret store (Kubernetes Secrets backed by an external store, ECS task-definition `secrets` from Secrets Manager or SSM Parameter Store, Docker Swarm secrets), mount them as files rather than env vars where possible, and use BuildKit `--mount=type=secret` for secrets needed only at build time. Rotate them and audit access.

---

## Terraform

### State, remote backends and locking {#tf-state}

Terraform state maps your configuration to real resource IDs and stores attributes and dependencies. Terraform creates the state file on the first `apply` (or `import`), and every `plan` compares config, state and reality.

**Remote backend**, for example S3:

- shared by the team and CI, encrypted (SSE-KMS), **versioned** (to recover from corruption), with restricted IAM access.
- **locking**, so two applies can't write at once. With S3, Terraform 1.10+ supports native locking (`use_lockfile = true`). Older setups use a DynamoDB table, which is now deprecated. Other backends: Azure Blob (blob lease), GCS, Terraform Cloud/HCP.

Keep state per environment and per component to reduce blast radius and plan time. Treat state as sensitive, because it can contain secrets in plain text.

### Drift {#tf-drift}

Drift is when real infrastructure no longer matches state and config, usually because of console changes. `terraform plan` refreshes and shows it. `terraform plan -refresh-only` shows only the changes made outside Terraform, and `apply -refresh-only` accepts them into state.

Handling it: decide whether the manual change was right. If yes, **put it into code** so the next plan is clean. If no, apply to put it back. Prevent it with drift detection in CI (a scheduled `plan -detailed-exitcode`, where exit code 2 means changes), read-only console access for humans, and AWS Config or Azure Policy alerts.

**Drift that would recreate a production resource:** don't apply blindly. Read why it wants to replace (`# forces replacement`). Usually you update the code to match reality, or use `lifecycle { ignore_changes = [...] }` for attributes owned elsewhere. If an identity changed, `terraform state rm` plus `import` the real resource. Add `prevent_destroy` to critical resources.

### Lost or corrupted state {#tf-state-lost}

The infrastructure keeps running. Terraform just forgets about it, so the next apply would try to **create duplicates** (and fail on unique names).

Recovery:

1. Restore from a backend version (S3 versioning) or `terraform.tfstate.backup`.
2. If there's no backup, re-import every resource (`import` blocks in Terraform 1.5+, or `terraform import`), and repeat until `plan` shows no changes.
3. For corruption from concurrent applies: stop all runs, restore the last good version, `force-unlock` only if you're sure no run is active, then plan to reconcile.

Prevention: remote backend with versioning and locking, applies only from CI, and backups of state.

### Importing existing resources {#tf-import}

- Terraform 1.5+: declare an `import { to = aws_vpc.main  id = "vpc-0abc…" }` block and run `terraform plan -generate-config-out=generated.tf` to get a starting config. Review it, tidy it up, then apply.
- Classic: write the `resource` block first, then `terraform import aws_vpc.main vpc-0abc…`.
- Before importing: know the resource ID format (from the provider docs), make sure the provider points at the right account and region, and plan until there's no diff.
- Import adds to state only. Your code must match reality, or the next apply will change the resource.
- Tools for bulk imports: Terraformer, or `aws` CLI plus generated import blocks.

### Partial apply failure {#tf-partial-apply}

Terraform doesn't roll back. Resources created before the error stay in state, and a resource that failed during creation may be marked **tainted** (it will be replaced next time).

1. Read the error: quota, IAM, a name conflict, an API rate limit, a dependency timing issue.
2. Fix the cause and run `plan` again. Terraform only creates what's missing.
3. If something was created but not recorded (a crash or timeout), `import` it instead of creating a duplicate.
4. Use `-target` only to get unstuck, never as normal practice.

Prevent it with smaller states, `depends_on` where implicit dependencies are missing, and retries or timeouts in the provider.

### `count` vs `for_each` {#count-vs-foreach}

`count` creates N copies addressed by **index** (`aws_instance.web[0]`). Removing an item from the middle of a list shifts the indexes and **destroys and recreates** everything after it. `for_each` takes a map or set and addresses copies by **key** (`aws_s3_bucket.b["prod"]`), so adding or removing one item affects only that item. Use `count` for "N identical things" or a simple on/off (`count = var.enabled ? 1 : 0`). Use `for_each` for anything with identity.

### Modules and multiple environments {#tf-environments}

- **Modules**: reusable, versioned building blocks (VPC, EKS, RDS) with clear inputs and outputs, published to a registry or Git with tags. Keep them small and focused.
- **Environments**: a separate root configuration (directory) per environment and component, for example `live/prod/network` and `live/prod/eks`, each with its own backend key and `*.tfvars`, all calling the same module versions. Promote by bumping module versions dev → stage → prod. Terragrunt helps keep this DRY.
- **Workspaces** share the same code with separate state. They're fine for identical, short-lived copies, but weak isolation for prod (same backend, easy to apply to the wrong workspace).
- Separate accounts or subscriptions per environment, and separate CI credentials per environment.

### Secrets in Terraform {#tf-secrets}

- Don't hardcode secrets or commit `*.tfvars` with secrets.
- Read them at plan time from a secret store (`aws_secretsmanager_secret_version`, `azurerm_key_vault_secret`, the Vault provider), or let the service generate them (`manage_master_user_password = true` for RDS, which keeps the password in Secrets Manager).
- Without a vault: pass them as `TF_VAR_db_password` environment variables from the CI secret store, and mark variables and outputs `sensitive = true`.
- Remember that values still land in **state**, so encrypt the backend and restrict access. Terraform 1.10+ supports `ephemeral` values and resources, which are never written to state.

### Terraform in CI/CD {#tf-pipeline}

1. On pull request: `fmt -check`, `validate`, `tflint`, security scan (`checkov`, `tfsec` or `trivy config`), then `plan -out=tfplan`, and post the plan to the PR.
2. Policy as code (OPA/Conftest, Sentinel) for guardrails such as no public buckets or required tags.
3. Merge to main, then a **manual approval** (an environment protection rule), then `apply tfplan`, the *saved* plan, so what was reviewed is exactly what gets applied.
4. The runner authenticates with OIDC (short-lived cloud credentials), with a separate role per environment, and stores state remotely with locking.
5. A scheduled drift-detection plan.

In Jenkins this is the same flow as a declarative pipeline with an `input` step before apply.

### Terraform commands and lifecycle {#tf-commands}

`init` (download providers and modules, configure the backend) → `validate` (syntax and types) → `fmt` → `plan` (refresh plus diff) → `apply` → `destroy`. Also useful: `state list|show|mv|rm`, `import`, `output`, `graph` (DOT output of the dependency graph), `console`, `force-unlock`, `providers`, `-replace=ADDR` (the modern `taint`). Debug with `TF_LOG=DEBUG`.

Lifecycle meta-arguments: `create_before_destroy` (for zero downtime), `prevent_destroy`, `ignore_changes`, `replace_triggered_by`, plus `precondition` and `postcondition`.

---

## CI/CD and Git

### End-to-end CI/CD pipeline {#cicd-pipeline}

**CI** (on every pull request and merge):

1. Checkout, restore caches, compile.
2. Unit tests and coverage.
3. Static analysis and quality gate (SonarQube), linting.
4. SAST and dependency scan (Semgrep, Snyk, OWASP Dependency-Check), secret scan (gitleaks).
5. Build the image, tagged with the **commit SHA**, then image scan (Trivy). Fail on critical vulnerabilities that have a fix.
6. Push to the registry (ECR, ACR, Artifactory), sign it (cosign), and produce an SBOM.

**CD**:

7. Deploy to dev, then integration and smoke tests.
8. Promote **the same artefact** to staging, then a DAST or performance check.
9. Approval or change gate for prod.
10. Progressive rollout (canary or blue-green) with automated analysis.
11. Automatic rollback on SLO breach. Notify the team.

Delivery mechanisms: push-based (Jenkins or GitHub Actions running `helm upgrade`) or **GitOps**, where CI updates the image tag in a config repo and Argo CD or Flux syncs the cluster.

### Secrets in pipelines {#cicd-secrets}

- Use the platform's secret store (Jenkins Credentials, GitHub Secrets and Environments, GitLab masked and protected variables, Azure DevOps variable groups linked to Key Vault). Never put secrets in the repo.
- Prefer **OIDC federation** to the cloud (GitHub Actions to an AWS IAM role, or to Azure workload identity federation) so there are no long-lived keys.
- Pull secrets at runtime from Vault or Secrets Manager, with least-privilege and per-environment credentials.
- Mask them in logs, don't `echo` them, and avoid passing them on the command line (visible in `ps`).
- Run gitleaks and push protection to stop secrets being committed. Rotate anything that leaks.

### Pipeline green but the old version is running {#old-version-deployed}

- **Mutable tag** (`latest`, or reusing `v1`) with `imagePullPolicy: IfNotPresent`: nodes keep their cached image. Fix: immutable tags (commit SHA) or deploy by digest.
- The manifest or Helm values weren't actually changed (the tag wasn't templated, or the wrong values file), so nothing rolled.
- GitOps: Argo CD hasn't synced, is out of sync, or points at the wrong branch or path.
- The rollout is stuck: new pods aren't Ready, so the old ReplicaSet keeps serving. Check `kubectl rollout status`.
- Deployed to the wrong namespace, cluster or context. A CDN or browser cache serves old static files.

Verify with `kubectl get deploy -o jsonpath='{..image}'` and the image digest the pods actually run.

### Pipeline that suddenly fails with no changes {#pipeline-sudden-failure}

Something outside the pipeline changed:

- An unpinned dependency or base image (`latest`, `^1.2`).
- An expired credential, token or certificate.
- A plugin or runner image update, or a changed agent tool version.
- Agent disk full.
- An external service down or rate-limiting (Docker Hub, npm, Maven Central).
- Flaky tests.
- Infrastructure quota limits.

Compare the last green run's logs and environment with the red one. Fix permanently by pinning versions and using lock files, mirroring dependencies through Artifactory or Nexus, and using ephemeral agents built from a versioned image.

### Speeding up a slow pipeline (45 minutes) {#pipeline-speed}

1. Measure first: time each stage and find the critical path.
2. Run independent stages and test shards **in parallel**, and use matrix builds.
3. Cache dependencies (`~/.m2`, `node_modules` or the npm cache, pip) and Docker layers (BuildKit `--cache-from`/`--cache-to`, registry cache).
4. Build only what changed: path filters, or a monorepo tool (Nx, Bazel, Turborepo) for affected services.
5. Reorder Dockerfiles for layer cache hits.
6. Move slow suites (end-to-end, performance) to a later stage or a nightly run, and keep fast checks on the PR.
7. Bigger or autoscaled ephemeral runners. Fix flaky tests instead of retrying them.
8. In Jenkins: shared libraries to cut duplication, `parallel` blocks, `stash`/`unstash` and agent labels.

### Rollback in CI/CD {#rollback}

- Kubernetes: `kubectl rollout undo` or `helm rollback <release> <rev>`. With GitOps, `git revert` the config commit and let Argo CD sync.
- Blue-green: switch traffic back to blue.
- Canary: abort, so all traffic returns to the stable version (Argo Rollouts and Flagger do this automatically on failed analysis).
- Automate it with post-deploy smoke tests and metric checks that trigger the rollback.
- The database is the hard part: use backward-compatible migrations so rolling back the app doesn't need a schema rollback.

### Branching strategies {#branching}

- **Trunk-based**: short-lived feature branches merged to `main` several times a day, feature flags for unfinished work, and releases cut from main or tags. Best for CI/CD and frequent deploys.
- **GitFlow**: `develop`, `feature/*`, `release/*`, `hotfix/*`, `main`. Suits scheduled releases but merges get heavy.
- **Release branches**: stabilise and patch a version while main moves on.
- Protect `main`: PR reviews, required checks, no force pushes, CODEOWNERS.

**Production bug**: branch `hotfix/*` from the release tag or main, fix it, test it, deploy it, then merge or cherry-pick back so the fix isn't lost.

### Merge vs rebase {#merge-vs-rebase}

`git merge` combines histories with a **merge commit** that has two parents. It's non-destructive and keeps the real history. `git rebase` **replays** your commits on top of the target branch, creating new commits with new SHAs, for a linear history. Never rebase commits others have already pulled from a shared branch. A common pattern: rebase your private feature branch onto main to tidy it, then merge it via PR (squash or merge commit). **Squash** merges a branch as one commit.

### Undoing a bad commit already pushed to main {#git-revert}

Use `git revert <sha>`. It creates a new commit that undoes the change, without rewriting shared history, and is safe on protected branches. For a merge commit, `git revert -m 1 <merge-sha>`. `git reset --hard` plus a force push rewrites history and breaks everyone else's clones, so only do it on private branches.

Related commands: `git cherry-pick <sha>` copies specific commits to another branch. `git stash` shelves uncommitted work. `git reset --soft HEAD~3` then a commit squashes local commits.

### Jenkins essentials {#jenkins}

- **Architecture**: a controller (master) schedules builds and serves the UI. **Agents** (static or ephemeral, connected over SSH, JNLP/inbound, or as Kubernetes pods) run the work. Use **labels** (`agent { label 'linux && docker' }`) to pick a pool. With 70 agents you target labels, never agent names. Don't run builds on the controller.
- **Declarative vs scripted**: declarative (`pipeline { stages { … } }`) is structured, validated and has `post`, `when`, `input` and `options`. Scripted (`node { … }`) is plain Groovy, flexible but harder to maintain.
- **Shared libraries**: reusable Groovy in a separate repo with `vars/` (global steps such as `buildAndPush()`), `src/` (classes) and `resources/`. Load with `@Library('my-lib@v1') _`. They remove duplicated Jenkinsfiles across services.
- **Credentials**: the Credentials plugin (or Vault or a cloud secret manager), referenced with `withCredentials` or `credentials('id')`, scoped by folder.
- **Triggers**: SCM webhooks (GitHub, GitLab or Bitbucket push), poll SCM, cron (`H 2 * * *`), upstream jobs, manual or parameterised runs.
- **Security**: SSO with role- or matrix-based authorisation, keep plugins up to date, disable the controller's executors, run agents as non-root, and secure script approval.
- `JENKINS_HOME` defaults to `/var/lib/jenkins` on the controller. Agents use the remote root directory set per node (for example `/home/jenkins/agent`).
- Change the port with `--httpPort` (on systemd installs, `JENKINS_PORT` in the service override or `/etc/default/jenkins`).

---

## AWS and cloud

### VPC, subnets, route tables, security groups and NACLs {#vpc-basics}

- **VPC**: your private network in a region (a CIDR block such as `10.0.0.0/16`).
- **Subnet**: a slice of the VPC CIDR in **one AZ**. It's public if its route table has `0.0.0.0/0 → Internet Gateway`. Otherwise it's private.
- **Route table**: decides where traffic goes (local, IGW, NAT GW, TGW, peering, VPC endpoints).
- **Security group**: a **stateful** firewall at the instance or ENI level, with allow rules only. Return traffic is allowed automatically, and rules can reference other SGs.
- **Network ACL**: a **stateless** subnet-level firewall with ordered allow and deny rules. Return traffic needs explicit rules, including the **ephemeral ports** 1024–65535.

Typical 3-tier layout: public subnets (ALB, NAT GW), private app subnets, private DB subnets, across 2–3 AZs.

### NAT Gateway, Internet Gateway, and private-subnet outbound flow {#nat-gateway}

- **IGW**: attached to the VPC. It lets resources with public IPs in public subnets reach the internet and be reached from it.
- **NAT Gateway**: lives **in a public subnet** (it can't work from a private subnet because it needs the IGW route). Private subnets route `0.0.0.0/0 → NAT GW`. It translates private source IPs to its Elastic IP, so instances can start outbound connections while staying unreachable from outside. Use one per AZ for HA.

**A private app calls a third-party API**: the app's packet goes to the private route table, then to the NAT GW (source is translated to its EIP), then to the IGW and the internet. The response comes back to the EIP, the NAT GW translates it back using its connection table, and it reaches the instance. You need: the route, a security group egress rule (allowed by default), NACLs allowing ephemeral return ports, and DNS resolution.

**Without a NAT gateway**: use **VPC endpoints** (an S3 gateway endpoint, or interface endpoints for SSM, ECR, Secrets Manager and others) to reach AWS services privately. For OS packages, use an internal mirror or proxy, or Artifactory.

**Cost**: NAT GW charges per hour **and per GB processed**. Traffic to S3 or ECR through NAT adds up fast. Gateway endpoints for S3 and DynamoDB are free.

### ALB vs NLB vs CloudFront {#alb-nlb-cloudfront}

| | ALB | NLB | CloudFront |
|---|---|---|---|
| Layer | 7 (HTTP/HTTPS, gRPC, WebSocket) | 4 (TCP, UDP, TLS) | CDN at edge locations |
| Routing | Host, path, header and query rules, weighted target groups | Port-based | Cache behaviours by path |
| Features | WAF, Cognito/OIDC auth, redirects, sticky sessions | Static IP or EIP per AZ, very high throughput, low latency, preserves client IP, PrivateLink | Caching, TLS at edge, WAF, Lambda@Edge and CloudFront Functions, geo-restriction |
| Use for | Web apps and microservices | Non-HTTP, extreme performance, fixed IPs | Global static and dynamic content acceleration |

A load balancer distributes requests to **healthy** targets (round-robin or least outstanding requests on ALB, a flow hash on NLB). **Connection draining** (the deregistration delay) lets in-flight requests finish on a target before it's removed.

### EC2 unreachable or SSH failing {#ec2-ssh}

Work outside in:

1. **Instance health**: status checks. *System* checks are AWS hardware or network issues, so stop and start to move hosts. *Instance* checks are OS issues (kernel, fstab, full disk). There's also an *attached EBS* status check. View the console output or screenshot.
2. **Network path**: public IP or EIP (or are you on a VPN or bastion for private?), subnet route to the IGW, security group inbound 22 from *your* IP, NACL inbound 22 **and outbound ephemeral ports**, OS firewall (iptables/firewalld).
3. **Authentication**: right key pair and username (`ec2-user`, `ubuntu`), key file permissions (`chmod 400`), `sshd` running. For password authentication you need both `PasswordAuthentication yes` *and* the setting not overridden in `sshd_config.d/*.conf`, then `systemctl restart sshd`. The user must have a password, and `PermitRootLogin` and `AllowUsers` must allow it.
4. **Disk full or sshd crashed**: use **SSM Session Manager** or EC2 Serial Console to get in without SSH, or detach the root volume, mount it on a rescue instance and fix it.

Best practice: use SSM Session Manager (IAM-controlled, audited, no open port 22) rather than SSH keys. **Never share PEM files.** Give each person their own access.

### High CPU on a server {#high-cpu}

1. Scope: when did it start, which hosts, does it match deploys, traffic or cron jobs (CloudWatch or Prometheus)?
2. `top`/`htop`: `us` (user code), `sy` (kernel), `wa` (I/O wait, which is really a disk problem), `st` (steal: a noisy neighbour, or a **T-instance out of CPU credits**).
3. Find the process: `ps -eo pid,ppid,cmd,%cpu --sort=-%cpu | head`, `pidstat 1`, then threads (`top -H -p <pid>`), then profile (`perf top`, `py-spy`, a Java thread dump with `jstack`).
4. Common causes: a traffic spike, an infinite loop or regex catastrophe, GC thrash (memory pressure that looks like CPU), a runaway cron or backup, or crypto-mining malware.
5. Mitigate (scale out, restart, roll back, rate-limit), then fix the root cause and add an alert.

### Disk full {#disk-full}

```bash
df -h; df -i                                  # space and inodes
du -xh / --max-depth=1 2>/dev/null | sort -h  # where it's going
find /var -xdev -type f -size +500M -exec ls -lh {} +
lsof +L1                                      # deleted files still held open
```

- `df` shows full but `du` disagrees: a **deleted file still held open** by a process (usually a log). Restart or reload the process, or truncate it with `: > /proc/<pid>/fd/<n>`.
- Inodes full (`df -i`): millions of small files (sessions, caches, mail queue).
- Fix safely: compress or rotate logs (logrotate), clean package caches, `docker system prune`, `journalctl --vacuum-size=500M`. Truncate rather than `rm` open logs. Then extend the volume (EBS modify, `growpart` plus `resize2fs` or `xfs_growfs`).
- **Kubernetes `DiskPressure` while `df -h /` looks fine**: the kubelet watches the **nodefs and imagefs** (`/var/lib/kubelet`, `/var/lib/containerd`), which may be a different filesystem. It also counts **inodes**, container logs and `emptyDir`. Check `kubectl describe node` and `crictl images`, and let image GC run.

### HTTP 5xx and 503 troubleshooting {#http-5xx}

Find **who** generates the error first: the load balancer, the ingress or proxy, or the app (load balancer access logs and metrics separate `ELB_5XX` from `Target_5XX`).

- **502 Bad Gateway**: the upstream closed the connection or sent an invalid response. Keep-alive timeout mismatch (the app's idle timeout must be longer than the load balancer's), a crash mid-request.
- **503 Service Unavailable**: no healthy targets, endpoints empty, overload or throttling, a circuit breaker open.
- **504 Gateway Timeout**: the upstream is too slow. Look at slow queries, downstream latency, thread or connection pool exhaustion, and timeouts that don't line up.
- **500**: application exception. Read logs and traces.

Then correlate with deploys, config changes, dependency health and saturation. Mitigate first (roll back, scale, shed load), then find the root cause.

### Latency went up but CPU and memory are fine {#latency-normal-resources}

CPU and memory aren't the only resources that saturate:

- **Downstream dependencies**: the database (slow queries, locks), caches, third-party APIs. Distributed tracing shows which span grew.
- **Pools and queues**: thread pool, DB connection pool or HTTP client pool exhaustion, so requests wait for a slot while CPU sits idle.
- **GC pauses**, lock contention, single-threaded bottlenecks.
- **Network**: DNS resolution time (`ndots:5` in Kubernetes causing extra lookups, conntrack table full), TLS handshakes without keep-alive, packet loss and retransmits, cross-AZ hops.
- **Throttling**: CPU **CFS throttling** from container limits (CPU averages look low but the pod is throttled: check `container_cpu_cfs_throttled_periods_total`), API rate limits, EBS IOPS or burst credits, T-instance credits.
- Check **p99, not averages**. Compare by AZ, node and version to find the common factor.

### IAM roles vs policies; IAM vs SCP {#iam}

- A **policy** is a JSON document of permissions (Effect, Action, Resource, Condition). A **role** is an identity with no long-term credentials that a trusted principal *assumes* (EC2, Lambda, a pod through IRSA, another account, or an SSO user) to get temporary credentials. Policies attach to users, groups and roles.
- **SCPs** (AWS Organizations) don't grant anything. They set the **maximum** permissions for accounts or OUs. Effective permission requires an allow in the identity or resource policy, **and** no explicit deny anywhere (SCP, RCP, permission boundary, session policy, resource policy).
- **Access Denied even though IAM allows it**: check an SCP deny, a permission boundary, the resource policy (S3 bucket policy, KMS key policy), session policy conditions (MFA, source IP or VPC endpoint), the wrong account or region, or missing KMS permissions for encrypted data. Use CloudTrail (`errorCode`), the IAM Policy Simulator and IAM Access Analyzer.
- Wildcards (`s3:Get*`, `arn:aws:s3:::bucket/*`) are convenient but widen access. Prefer explicit actions and resources.

### Securing an AWS account and environment {#aws-security}

- **Organization structure**: AWS Organizations with Control Tower or a landing zone, separate accounts per environment and workload, SCP guardrails, centralised logging and security accounts.
- **Identity**: IAM Identity Center (SSO) with MFA, no IAM users or access keys for humans, root locked away with MFA, least privilege, Access Analyzer.
- **Detection**: CloudTrail (organisation trail, log file validation), AWS Config with conformance packs, GuardDuty, Security Hub (CIS/FSBP), Inspector, Macie for S3 data.
- **Data**: KMS encryption at rest, TLS in transit, S3 Block Public Access, backups with AWS Backup and Vault Lock.
- **Network**: private subnets, minimal security groups, WAF and Shield on public endpoints, VPC endpoints.
- **Operations**: patch with SSM, and keep secrets in Secrets Manager.

### Leaked AWS access key {#leaked-key}

First hour:

1. **Deactivate** the key straight away (and delete it once you've confirmed nothing legitimate breaks). If it's compromised, also attach a deny-all policy to the user and revoke active sessions for any roles it may have assumed.
2. **Investigate with CloudTrail**: every API call by that access key ID, across all regions. Look for new IAM users, roles, keys, login profiles or policies (persistence), unusual EC2 or GPU launches (mining), S3 data access, and disabled logging.
3. **Contain and clean up**: delete anything the attacker created, rotate other credentials that may be exposed, and check GuardDuty findings and billing.
4. **Fix the source**: remove it from Git history (`git filter-repo` or BFG; the key is burned regardless), turn on secret scanning and push protection, and replace static keys with roles or OIDC.
5. Write a postmortem, and notify security or compliance as policy requires.

### Disaster recovery strategies, RTO and RPO {#dr-strategies}

**RTO** is how long you can be down. **RPO** is how much data you can lose. The business sets both, and they drive both cost and design.

| Strategy | RTO / RPO | Cost |
|---|---|---|
| Backup and restore (AWS Backup, cross-region snapshot copies) | Hours / hours | $ |
| Pilot light (data replicated, core infrastructure minimal, compute off) | Tens of minutes / minutes | $$ |
| Warm standby (scaled-down full stack running in DR) | Minutes / seconds to minutes | $$$ |
| Multi-site active-active | Near zero / near zero | $$$$ |

Building blocks: infrastructure as code so the DR region can be built on demand, data replication (Aurora Global Database, DynamoDB global tables, S3 cross-region replication, cross-region RDS read replicas), Route 53 failover or ARC routing controls, images and secrets replicated to the DR region.

**Test it** with regular DR drills that measure the actual RTO and RPO, and plan **failback** too. Replication also copies deletions and corruption, so keep point-in-time backups as well.

### High availability on AWS (3-tier) {#aws-ha}

Route 53 → CloudFront and WAF → ALB across **2–3 AZs** → an Auto Scaling group or EKS/ECS spread across AZs (health checks replace bad instances) → **Multi-AZ** RDS or Aurora (synchronous standby, automatic failover, read replicas for reads) → ElastiCache with Multi-AZ → S3 for static assets and backups. NAT gateways per AZ. Stateless app tier with sessions in Redis or DynamoDB. Everything as code, with CloudWatch alarms and auto-recovery. HA (surviving an AZ failure) is not DR (surviving a region failure or data loss). You need both.

### Reducing cloud cost {#cost-reduction}

1. **Visibility first**: tag compliance (owner, team, environment, cost-center), Cost Explorer or CUR with CUDOS dashboards, showback per team, anomaly detection.
2. **Remove waste**: idle and unattached resources (EBS volumes, EIPs, old snapshots, load balancers with no targets, idle RDS), dev environments shut down at night and weekends (Instance Scheduler, scale to zero), log retention.
3. **Right-size**: Compute Optimizer, Kubernetes requests from actual p95 usage (VPA recommendations), Graviton/ARM (often 20–40% better price-performance).
4. **Pricing models**: Savings Plans or RIs for the steady baseline, Spot for stateless, fault-tolerant and batch work (diversify instance types and AZs, handle 2-minute interruption notices).
5. **Storage**: S3 lifecycle rules and Intelligent-Tiering, gp2 → gp3, Glacier for archives.
6. **Network**: VPC endpoints instead of NAT for AWS service traffic, keep traffic in one AZ where safe, CloudFront in front of origins.
7. Make it continuous: budgets and alerts, a cost review in architecture decisions, and unit cost metrics such as cost per order.

**A sudden overnight bill spike**: Cost Explorer grouped by service, account, usage type and tag, plus Cost Anomaly Detection, then the CUR line items. Usual suspects: NAT or data-transfer charges (a chatty service across AZs or to the internet, or logs shipped through NAT), a runaway autoscaling group or retry loop, a forgotten large or GPU instance, CloudWatch Logs ingestion from a debug log level, or a compromised key mining crypto.

---

## Linux and networking

### What happens when you type a URL and press Enter {#url-flow}

1. The browser parses the URL and checks HSTS and its cache.
2. **DNS resolution**: browser cache → OS cache and `/etc/hosts` → recursive resolver → (on a miss) root → TLD (`.com`) → authoritative nameserver → A/AAAA record (often via CNAMEs, with TTL caching at each step).
3. **TCP** three-way handshake (SYN, SYN-ACK, ACK) to port 443, or QUIC over UDP for HTTP/3.
4. **TLS handshake** (TLS 1.3): ClientHello with SNI and key shares, ServerHello and the certificate chain. The client validates the chain to a trusted CA, the hostname and expiry, both sides derive session keys, and encrypted traffic starts.
5. **HTTP request**: `GET /` with headers and cookies, through a CDN, load balancer, reverse proxy and app server, which may call databases and caches.
6. **Response**: status, headers and body. The browser parses the HTML, fetches CSS, JS and images (more requests, reusing connections), and renders.

### DNS resolution and recursive DNS {#dns}

A **recursive resolver** (your ISP, 8.8.8.8, Route 53 Resolver or CoreDNS upstream) does the work for the client: it queries root, TLD and authoritative servers in turn (*iterative* queries) and caches the answers for their TTL. An **authoritative** server holds the zone's records. Common record types: A/AAAA, CNAME, ALIAS (Route 53 alias, at the zone apex), MX, TXT, NS, SOA. DNS uses port **53**, UDP and TCP (TCP for large responses and zone transfers).

**DNS works from your laptop but fails intermittently inside Kubernetes**: CoreDNS overloaded or crashing (scale it, or use NodeLocal DNSCache), `ndots:5` causing five search-domain lookups per name, conntrack races on UDP (the classic 5-second timeouts), NetworkPolicy blocking port 53, upstream resolver limits (the VPC resolver allows 1024 packets per second per ENI).

### TLS/SSL certificates {#tls}

A certificate binds a public key to a domain name and is signed by a Certificate Authority. During the handshake, the client checks the chain up to a trusted root, the hostname (SAN), validity dates and revocation. If the certificate is **missing, expired, self-signed or for the wrong name**, browsers show a full-page warning (`NET::ERR_CERT_DATE_INVALID` and similar), API clients fail the handshake outright, and HSTS sites can't be clicked through at all.

**Preventing expiry outages**: automate issuance and renewal (ACM-managed certificates on ALB or CloudFront, cert-manager with Let's Encrypt in Kubernetes), monitor expiry dates and alert at 30, 14 and 7 days, keep an inventory of every certificate (including internal mTLS and CA certificates), and run renewal drills.

### OSI and TCP/IP models {#osi}

OSI has 7 layers: Physical, Data Link (MAC, switches), Network (IP, routing), Transport (TCP/UDP, ports), Session, Presentation (encoding, TLS sits roughly here), Application (HTTP, DNS). The TCP/IP model has 4: Link, Internet, Transport, Application. The internet *runs* on TCP/IP. OSI is the teaching and troubleshooting vocabulary ("it's an L4 issue"). L4 load balancers route on IP and port. L7 load balancers understand HTTP.

TCP is connection-oriented, reliable, ordered and flow-controlled (web, SSH, databases). UDP is connectionless with no delivery guarantee but low overhead (DNS, streaming, VoIP, QUIC).

Common ports: SSH 22, FTP 21 (data 20), SMTP 25, DNS 53, HTTP 80, HTTPS 443, NFS 2049, MySQL 3306, PostgreSQL 5432, RDP 3389. SFTP runs over SSH on 22.

### Load balancer vs reverse proxy {#lb-vs-proxy}

A **reverse proxy** sits in front of servers and handles requests on their behalf: TLS termination, caching, compression, routing, auth, rate limiting (NGINX, Envoy). A **load balancer** distributes traffic across several backends with health checks. Most L7 load balancers *are* reverse proxies with balancing, so the overlap is large. The difference is the main purpose. An **API gateway** adds API-specific features (keys, quotas, request validation, auth, transformation). Azure **Application Gateway** is a regional L7 load balancer with WAF, while an API gateway (APIM, AWS API Gateway) manages APIs.

### Processes, signals and zombies {#linux-processes}

- `kill -15` (SIGTERM) asks politely and can be caught. `kill -9` (SIGKILL) can't be caught and gives no cleanup. SIGHUP is often used for "reload config".
- **Zombie**: a process that has exited but whose parent hasn't `wait()`ed for it. It uses no resources except a PID-table entry. Fix the parent, or kill the parent so init reaps it.
- **Orphan**: the parent died first. It's re-parented to PID 1 (or a subreaper) and keeps running.
- A process is a separate address space. Threads share memory inside one process.
- PID 1 in containers must reap zombies and forward signals. Use `tini` or `--init` if your app can't.

### Inodes, file descriptors and limits {#inodes-fds}

An **inode** stores a file's metadata (owner, permissions, size, block pointers) but not its name, which lives in the directory entry. A filesystem can run out of inodes while it still has free space.

**Open file descriptors spiking**: `ls /proc/<pid>/fd | wc -l`, `lsof -p <pid>`. Usually a leak (connections or files not closed) or a burst of connections. Limits: `ulimit -n`, `LimitNOFILE` in the systemd unit, `fs.file-max`. Find the leaking type (sockets in CLOSE_WAIT mean the app isn't closing connections).

### Linux boot process {#linux-boot}

Firmware (BIOS or UEFI, POST) → bootloader (GRUB2) loads the kernel and **initramfs** → the kernel initialises hardware and mounts initramfs → initramfs loads drivers and mounts the real root filesystem → `systemd` (PID 1) starts units by target (`multi-user.target`) → services, networking, getty and login. To debug: the console or serial output, `journalctl -b`, `systemctl --failed`, `dmesg`.

### Blocking a malicious IP on a server {#block-ip}

Without NACLs or WAF, block it on the host:

- `iptables -I INPUT -s 203.0.113.7 -j DROP`, or `firewall-cmd --permanent --add-rich-rule='rule family=ipv4 source address=203.0.113.7 drop' && firewall-cmd --reload`, or `nft`.
- Or at NGINX: `deny 203.0.113.7;` in the server block, plus `limit_req` for rate limiting.
- Behind a load balancer, the client IP is in `X-Forwarded-For`, so use `real_ip` settings.
- Automate repeat offenders with fail2ban. At scale, push the block up to the security group, WAF or CDN so it never reaches the host.

---

## SRE practices

### SLI, SLO, SLA and error budgets {#slo}

- **SLI**: a measurement of user experience, as good events divided by valid events (the share of successful requests, the share of requests under 300 ms).
- **SLO**: an internal target for an SLI over a window (99.9% over 30 days).
- **SLA**: an external **contract** with penalties. It's set looser than the SLO so you have warning before breaching it.
- **Error budget**: `1 − SLO`. 99.9% over 30 days is about 43 minutes of "bad". While budget remains, ship features. When it's burning fast or gone, prioritise reliability or freeze risky releases. That's the agreed mechanism for balancing speed and stability.
- **Alert on burn rate** (for example 14.4× over 1 hour *and* 5 minutes for a page), not on raw CPU.
- Availability arithmetic: 99.9% allows 8.76 hours of downtime a year, and 99.99% allows 52.6 minutes. Going from 99.95% to 99.5% adds about 39.4 hours a year of extra downtime.

### Metrics, logs and traces {#observability}

- **Metrics**: cheap, aggregated numbers over time, for alerting and trends (Prometheus, CloudWatch).
- **Logs**: detailed discrete events, for the *why* (ELK/OpenSearch, Loki, Splunk).
- **Traces**: one request's path across services with timings per span, for *where* the time went (OpenTelemetry, Jaeger, Tempo, X-Ray).

They work together: an alert on a metric (SLO burn) → an exemplar or trace ID → the slow span → logs for that trace ID (correlation IDs in every log line). Methods: **RED** (Rate, Errors, Duration) for services, **USE** (Utilisation, Saturation, Errors) for resources, and the **four golden signals** (latency, traffic, errors, saturation).

**Prometheus** *pulls* (scrapes) `/metrics` HTTP endpoints from targets found through service discovery (Kubernetes SD, EC2 SD), stores time series locally (TSDB), evaluates recording and alerting rules, and sends alerts to **Alertmanager** (grouping, routing, silencing, inhibition). Exporters (node_exporter, kube-state-metrics, blackbox) expose metrics for things that can't instrument themselves. **Grafana** queries data sources (Prometheus, Loki, CloudWatch, Elasticsearch, Tempo) and visualises them. Watch label **cardinality**: no user IDs or request IDs in labels.

### Alert design and alert fatigue {#alerting}

Page only on **symptoms users feel** (SLO burn rate, availability, latency), and send everything else (disk at 70%, one pod restarting) to tickets or dashboards. Every page must be actionable, link a runbook and have a clear owner. Route by service ownership (an on-call schedule per team). Use multi-window burn-rate alerts, grouping and inhibition (don't page for 50 symptoms of one root cause), and review noisy alerts weekly: tune them or delete them.

**The same alert fires every Monday at 9 a.m.**: find the cause (a weekly batch job, a traffic pattern, a backup) and fix it. Adjust the threshold or condition to reflect user impact (for example `for: 10m`, or alert on burn rate). Don't just silence it.

### Incident response {#incident-response}

1. **Detect and declare**: acknowledge, open a channel or bridge, set severity by user impact.
2. **Assign roles**: incident commander (coordinates and decides), ops lead (hands on keyboard), communications lead (stakeholder and status-page updates on a fixed cadence), scribe (timeline).
3. **Stabilise first**: "what changed?" (deploys, config, feature flags, infrastructure, dependencies), then mitigate: roll back, fail over, scale, turn off a feature, shed load. Restore service before you look for the root cause.
4. **Communicate** regularly, even when there's no news.
5. **Resolve**, then a **blameless postmortem** within days: impact, timeline, root cause and contributing factors, what went well and badly, and **owned, dated action items** (prevent, detect, mitigate), tracked to completion.

**A 100-person bridge with no owner**: take the IC role explicitly, cut the bridge to the people working on it, move observers to a status channel, give out workstreams with owners and check-in times, and run a fixed update cadence.

### Postmortems that change the system {#postmortem}

Blameless: ask "how did the system allow this?" rather than "who did it?". Use timelines from data, the 5 Whys or a contributing-factors analysis, and look for the missing safeguard (a test category, an alert, a guardrail, a review step). Actions must be specific, owned, prioritised and followed up in a recurring review. Share learnings across teams. Measure recurrence. A postmortem that only says "be more careful" changed nothing.

### Toil, MTTR, MTTD and MTBF {#toil-metrics}

**Toil** is manual, repetitive, automatable work that grows with the service and has no lasting value. SRE practice caps it (Google's guideline is about 50% of time) and automates it away. **MTTD**: mean time to detect. **MTTR**: mean time to restore. **MTBF**: mean time between failures. Together with the DORA metrics (deployment frequency, lead time for changes, change failure rate, time to restore), these show whether reliability work is paying off. Be careful: averages hide outliers, and metrics get gamed when they become targets.

### Cascading failures and resilience patterns {#resilience}

- **Timeouts** on every remote call, shorter than the caller's timeout.
- **Retries** with exponential back-off and **jitter**, a retry budget, and only for idempotent operations. Don't retry at every layer, or retries multiply.
- **Circuit breakers** fail fast when a dependency is unhealthy, then probe it to recover.
- **Bulkheads**: separate pools or queues per dependency.
- **Load shedding and rate limiting**: reject early with 429 or 503 instead of collapsing.
- **Graceful degradation**: serve cached or partial results.
- **Backpressure**: bounded queues.

**Why restarting the app after a database recovery can make things worse**: every instance reconnects at once (a **thundering herd**), with cold caches and warm-up queries, so the freshly recovered database is overloaded again. Recover with staggered restarts, connection-pool limits, jittered reconnects and gradual traffic ramp-up.

### Behavioural questions (STAR) {#behavioural}

Use **STAR**: Situation (one line of context), Task (your responsibility), Action (what *you* did: tools, decisions, trade-offs), Result (numbers: MTTR down X%, cost down Y%, incidents avoided). Prepare 6–8 real stories that you can reuse:

- a major incident you led
- a failure or mistake and what changed afterwards
- a disagreement or pushback (for example on a risky launch) and how it was resolved
- a time you influenced without authority
- an automation that removed toil
- a cost or performance win
- a time you went beyond your scope
- mentoring someone

For "Do you have questions for us?", ask about their on-call load and how incidents are reviewed, their deployment frequency and pipeline, what their biggest reliability or platform challenge is, and how the team measures success.
