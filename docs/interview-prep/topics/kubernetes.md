---
tags:
  - interview
  - kubernetes
---

# Kubernetes questions (company not named)

Collected from saved posts where the company wasn't named. Duplicates are merged, and common ones link to [Core answers](../core-answers.md).

## Architecture and internals

**Explain Kubernetes architecture / components.** → [Core](../core-answers.md#k8s-architecture)

**What is Kubernetes and why use it? Kubernetes vs Docker? Docker Swarm vs Kubernetes?** Kubernetes is a container orchestrator: it schedules containers across a cluster, self-heals, scales, does service discovery and rolling updates, and manages config, secrets and storage declaratively. **Docker** builds and runs containers on one host. Kubernetes runs them across many hosts (using containerd underneath). **Swarm** is Docker's simpler built-in orchestrator, easy to start with but with a much smaller ecosystem, and it's rarely chosen for new platforms.

**How does Kubernetes decide which node to schedule a pod on? How is a pod assigned to a node?** → [Core: scheduler](../core-answers.md#k8s-architecture). Filtering (resources against requests, taints and tolerations, node selector and affinity, volume zones, ports), then scoring, then binding.

**What happens internally when you run `kubectl apply` / run a container in Kubernetes?** → [Core](../core-answers.md#kubectl-apply-flow)

**What is kube-proxy?** A per-node agent that watches Services and EndpointSlices and programs **iptables or IPVS** rules so that traffic to a Service's ClusterIP or NodePort is load-balanced to ready pod IPs. It doesn't proxy traffic itself in these modes (the kernel does). eBPF CNIs (Cilium) can replace it.

**How does Kubernetes service discovery and DNS work? What happens when one service calls another?** CoreDNS watches Services and serves records: `svc.ns.svc.cluster.local` → ClusterIP (or pod IPs for headless). Pods get `/etc/resolv.conf` pointing at the CoreDNS Service IP with search domains (`ns.svc.cluster.local`, `svc.cluster.local`, `cluster.local`) and `ndots:5`. A call to `http://orders` resolves through the search path to the ClusterIP, kube-proxy rules DNAT it to a ready pod, and the CNI routes it there. → [Core: request flow](../core-answers.md#k8s-request-flow)

**How does Kubernetes handle pod failures and self-healing?** → [J.P. Morgan #2](../companies/jp-morgan.md)

**What is a pod? Container vs pod? How many containers per pod, and how many pods per node? One container or several per pod?** A pod is the smallest deployable unit: one or more containers sharing a network namespace (same IP, they talk over `localhost`), volumes and lifecycle, always scheduled together. Usually **one main container per pod**, plus sidecars or init containers only when they're tightly coupled (log shipper, proxy). Separate concerns go in separate pods so they scale independently. Pods per node are limited by `maxPods` (110 by default upstream; on EKS it depends on ENIs and IPs, for example 29 for m5.large without prefix delegation) and by resources.

**What is a sidecar container? Use cases?** A helper container in the same pod that extends the main app: log shipping, service mesh proxies (Envoy), config reloaders, auth proxies, file sync. Since Kubernetes 1.29 native sidecars are **init containers with `restartPolicy: Always`**, which start before the app and stop after it.

**What is a headless Service, and how does it work?** → [Core](../core-answers.md#services-ingress)

**What is a NodePort Service? Types of Services? Service vs Ingress? What is Ingress?** → [Core](../core-answers.md#services-ingress)

**How is load balancing done across pods?** A Service spreads connections across ready endpoints through kube-proxy (iptables random selection, IPVS round-robin and other algorithms). This is per **connection**, so long-lived HTTP/2 or gRPC connections stick to one pod. Use L7 load balancing (a service mesh or client-side gRPC load balancing) for even request-level distribution. External traffic is balanced by the cloud load balancer or the Ingress controller.

**What are API groups, CRDs, Operators?** → [HashedIn](../companies/hashedin-deloitte.md)

**What is a Kubernetes workload? Which resources do you use to deploy an app?** Workload resources manage pods: Deployment, StatefulSet, DaemonSet, Job, CronJob (and ReplicaSet underneath Deployment). A typical app uses a Deployment, Service, Ingress, ConfigMap, Secret (or ExternalSecret), ServiceAccount, HPA, PDB and NetworkPolicy, plus a PVC if it's stateful.

**Difference between a container and a DaemonSet?** A container is a running process from an image. A **DaemonSet** is a controller that makes sure one pod (with its containers) runs on every node, or on matching nodes. Used for node agents: log collectors, monitoring exporters, CNI and CSI plugins, kube-proxy.

**Deployment vs StatefulSet vs DaemonSet; why use StatefulSets for databases?** → [Core](../core-answers.md#workload-types)

**Four key fields in a manifest?** `apiVersion`, `kind`, `metadata`, `spec` (and `status`, which the system fills in).

**Contents of service.yaml and deployment.yaml.** → [HCLTech example](../companies/hcltech.md)

**What are ConfigMaps and Secrets? How do pods access secrets? How do you handle sensitive data in microservices?** → [Core](../core-answers.md#configmaps-secrets). Pods use Secrets as env vars (`valueFrom.secretKeyRef`/`envFrom`), mounted files (a `secret` volume), or through the CSI Secrets Store driver from an external vault.

**What are namespaces?** → [HashedIn](../companies/hashedin-deloitte.md)

**What does `kubectl describe` do? What does kubectl do?** `kubectl` is the CLI client for the Kubernetes API: it reads kubeconfig, authenticates, and makes REST calls (get, apply, delete, logs, exec). `kubectl describe` shows a human-readable, detailed view of a resource, including related **Events** (scheduling, pulls, probe failures, OOM), which makes it the first stop for troubleshooting.

**Pod affinity? Node affinity and anti-affinity conflicts not scheduling pods.** **Node affinity** places pods on nodes with given labels (required or preferred). **Pod affinity/anti-affinity** places pods near or away from other pods (by labels) within a topology domain (node, zone). If pods aren't scheduled: `kubectl describe pod` shows "didn't match pod affinity/anti-affinity rules" or "node(s) didn't match node selector". Conflicts happen when required rules can't all be satisfied (for example anti-affinity per node with more replicas than nodes). Best practice: prefer `preferredDuringScheduling` and **topologySpreadConstraints** for spreading, keep `required` rules minimal, and check that label keys match.

**Taint vs cordon; moving workloads off an unhealthy node.** → [Core](../core-answers.md#taint-cordon-drain)

**How do you restart a Deployment?** `kubectl rollout restart deployment/<name>`. It changes a pod-template annotation, which triggers a rolling restart that respects the strategy and PDBs. Don't delete all pods at once.

**How do you scale pods while keeping minimum replicas?** `kubectl scale deploy/x --replicas=N` for manual scaling, or an HPA with `minReplicas`/`maxReplicas`, plus a PDB `minAvailable` to keep a floor during disruptions.

**Rolling deployment, maxSurge and maxUnavailable; rollout and rollback; Recreate.** → [Core](../core-answers.md#rolling-update)

**Zero-downtime deployments; graceful pod termination with preStop hooks and termination grace periods.** → [Core](../core-answers.md#zero-downtime). Termination sequence: the pod is marked Terminating and removed from endpoints (asynchronously), the `preStop` hook runs, then **SIGTERM** goes to PID 1, the app drains in-flight work, and after `terminationGracePeriodSeconds` (default 30) it gets **SIGKILL**. The preStop sleep covers the race where load balancers and kube-proxy haven't removed the endpoint yet.

**Probes: types, which acts first, health checks.** → [Core](../core-answers.md#probes)

**HPA vs VPA; how does HPA make decisions; HPA not scaling under load.** → [Core](../core-answers.md#hpa). **VPA** recommends or sets CPU and memory **requests** from historical usage (it restarts pods to apply them, though in-place resize is arriving). Use HPA for horizontally scalable stateless services, VPA for right-sizing or for things that can't scale out. Don't combine them on the same CPU or memory metric.

**How do you monitor and scale a cluster? Measure metrics in Kubernetes?** metrics-server (for `kubectl top` and HPA), Prometheus with kube-state-metrics and node-exporter, Grafana dashboards, Cluster Autoscaler or Karpenter for nodes, HPA/KEDA for pods. → [Core: observability](../core-answers.md#observability)

**How do you deploy a Kubernetes cluster? Ensure high availability?** Managed (EKS, AKS, GKE) via Terraform for production. Self-managed with kubeadm (HA control plane with a stacked or external etcd, behind a load balancer), or k3s/kind/minikube for development. → [Accenture HA answer](../companies/accenture.md)

**How do you upgrade a cluster step by step?** → [Core](../core-answers.md#cluster-upgrade)

**Securing a cluster; security features; network policies for pod security; securing from external threats.** → [Core](../core-answers.md#k8s-security). **NetworkPolicies** select pods by label and define allowed ingress and egress (from pods, namespaces or CIDRs, by port). They need a CNI that enforces them (Calico, Cilium, the AWS VPC CNI with network policy turned on). Start with default-deny per namespace.

**How do you configure SSH access in Kubernetes?** You normally **don't SSH into pods**: use `kubectl exec` (RBAC-controlled, audited) or `kubectl debug`. For nodes, use SSM Session Manager or `kubectl debug node/<name> -it --image=busybox` (a privileged pod with the host filesystem at `/host`). If an app really needs SSH (an SFTP service), run an SSH server container with keys from a Secret and expose it through a Service. That's rare and security-sensitive.

**Persistent storage and stateful apps: key considerations.** Use StorageClasses with a CSI driver (EBS, EFS, Azure Disk), StatefulSets with `volumeClaimTemplates`, `WaitForFirstConsumer` binding (zone-aware), access modes (RWO for block, RWX through EFS or NFS), reclaim policy (Retain for prod data), backups or snapshots (Velero, VolumeSnapshots), and capacity and IOPS planning. Managed databases outside the cluster are usually the better choice. → [Paytm PV example](../companies/paytm.md)

**Setting up additional storage for worker nodes.** Bigger root volumes (the launch template or Karpenter EC2NodeClass `blockDeviceMappings`), a separate data volume for containerd (`/var/lib/containerd`) mounted through user data, instance-store NVMe for scratch (mounted and formatted at boot, used through `emptyDir` or a local-path provisioner), and `ephemeral-storage` requests and limits.

**Deploy WordPress on Kubernetes.** MySQL as a StatefulSet (or a managed RDS) with a PVC and a Secret for credentials, WordPress as a Deployment with env vars pointing at the DB service and a PVC (RWX, for example EFS, if more than one replica shares `wp-content`, or offload media to S3), a ClusterIP Service plus an Ingress with TLS (cert-manager). Easiest is `helm install wp oci://registry-1.docker.io/bitnamicharts/wordpress -f values.yaml`.

**Deploy 2 front-end and 15 back-end services from one GitLab repo to Kubernetes.** A monorepo with a folder per service, a GitLab CI pipeline using `rules: changes:` (or child pipelines per service) so only changed services build, one image per service tagged by SHA, a Helm chart per service (or one umbrella chart with a shared library chart), and GitOps or `helm upgrade` per service. Front ends go behind an Ingress with path or host routing, back ends stay ClusterIP.

**How do microservices communicate? Path-based routing for xyz.com.** Synchronously over HTTP/REST or gRPC through Service DNS names (optionally through a mesh), and asynchronously through queues or streams (Kafka, SQS, RabbitMQ). For `xyz.com`: DNS record → load balancer → Ingress with host `xyz.com` and paths (`/api` → api-svc, `/` → web-svc), plus a TLS secret.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: xyz }
spec:
  ingressClassName: nginx
  tls: [{ hosts: [xyz.com], secretName: xyz-tls }]
  rules:
    - host: xyz.com
      http:
        paths:
          - { path: /api, pathType: Prefix, backend: { service: { name: api-svc, port: { number: 80 } } } }
          - { path: /,    pathType: Prefix, backend: { service: { name: web-svc, port: { number: 80 } } } }
```

**What is Minikube?** → [Big 4](../companies/big4-aws-devops.md)

**Helm: chart, release, values, range, dependencies, install and upgrade, troubleshooting, best practices.** → [Core: Helm](../core-answers.md#helm). Dependencies go in `Chart.yaml` `dependencies:` (then `helm dependency update`). Troubleshoot with `helm template` / `--debug --dry-run`, `helm get manifest|values`, `helm history`, and `helm status`. Best practices: lint, a values schema, pinned chart versions, `--atomic`, no secrets in values, and library charts for shared templates.

**Helm vs plain YAML; Operators vs Helm charts.** Helm templates, packages, versions and rolls back sets of manifests. Plain YAML is static. **Helm is install-time templating**, while an **Operator is a runtime controller** that continuously manages the app (backups, failover, upgrades, scaling) through CRDs. Use Helm to install things, and Operators for complex stateful apps that need day-2 automation.

**Istio: what and why; features; architecture; integration with Kubernetes; traffic management; gateways; VirtualService; security; telemetry; best practices.**

- A service mesh providing **mTLS and identity, traffic management and telemetry**. → [J.P. Morgan #11](../companies/jp-morgan.md)
- **Architecture**: istiod (control plane: config distribution (xDS), certificate authority, service discovery from Kubernetes) and a data plane of Envoy sidecars injected through a namespace label, or the **ambient** mode (per-node ztunnel for L4 mTLS plus optional waypoint proxies for L7).
- **Traffic management**: VirtualService (routing rules: match on host, path or headers, weights, retries, timeouts, fault injection), DestinationRule (subsets and versions, load-balancing, connection pools, outlier detection, TLS), Gateway (ingress and egress gateways at the mesh edge, the Kubernetes Gateway API is now preferred), ServiceEntry (external services).
- **Security**: PeerAuthentication (mTLS STRICT), AuthorizationPolicy (allow or deny by identity, path, method), RequestAuthentication (JWT).
- **Telemetry**: standard metrics (request count, duration, size), access logs, and trace spans propagated (apps must forward trace headers).
- **Best practices**: start in PERMISSIVE then go STRICT, limit config scope with `Sidecar` resources, use revision-based canary upgrades of istiod, set resource requests for proxies, and watch proxy memory.

## Troubleshooting scenarios

**Pod not working / continuously restarting / CrashLoopBackOff / exit codes.** → [Core](../core-answers.md#crashloopbackoff)

**Pod Pending: CPU, memory, PVC, node selector, affinity, taints, quota; pod not getting scheduled; new EKS nodes join but pods stay Pending.** → [Core](../core-answers.md#pending-pods). For new nodes that are joined but still not used: check the node's labels and taints don't match the pod's selectors or tolerations, the CNI isn't ready on the new nodes (the node is `NotReady`, or no IPs left), node `allocatable` is smaller than the pod requests, or zone mismatch with a PVC.

**Pod stuck Pending due to storage.** No default StorageClass, a CSI driver not installed or failing (`ebs-csi-controller` logs, IRSA permissions), the PVC requests an AZ where no node can run (`WaitForFirstConsumer` fixes this), the volume limit per node is reached (EBS attachments per instance), capacity or quota, or a static PV whose `storageClassName`, access mode or size doesn't match. Run `kubectl describe pvc`.

**Pod running but Service not reachable / pods Ready, endpoints exist, users still get 503.** → [Core](../core-answers.md#pods-running-503). If endpoints exist and the pods are Ready, check the Ingress or load balancer layer (target registration, health-check path, security groups), NetworkPolicies blocking ingress-controller → pod traffic, the app returning 503 from a downstream dependency, or mTLS mismatches in a mesh.

**Pods in one namespace can't reach services in another namespace.** Use the fully qualified name (`svc.other-ns.svc.cluster.local`, because a short name resolves only in your own namespace), **NetworkPolicies** in the target namespace (default-deny without an allow from your namespace's `namespaceSelector`), service mesh AuthorizationPolicies or mTLS mode mismatch, or a `targetPort` mismatch. Test with `kubectl run tmp --rm -it --image=busybox -n src -- wget -qO- http://svc.other-ns:80`.

**A deployment keeps pulling the old image version.** → [Core](../core-answers.md#old-version-deployed)

**DNS works from your laptop but fails intermittently inside Kubernetes.** → [Core: DNS](../core-answers.md#dns)

**kubelet not registering new pods on a node.** Check `systemctl status kubelet` and `journalctl -u kubelet`: certificate expiry (kubelet client certificates rotation), it can't reach the API server, the container runtime is down (`crictl info`), disk or PID pressure, the CNI isn't initialised ("network plugin not ready"), the node is cordoned or tainted, or the node was deleted from the API (re-register it).

**Frequent DeadlineExceeded errors between services.** gRPC or context deadlines are being hit, so something is slower than the caller's budget: downstream latency (traces), CPU throttling, DNS lookup delays, connection storms, retries piling onto the deadline, or deadlines set too tight across a call chain (propagate remaining-time budgets). Fix the slow hop, align timeouts (each layer shorter than its caller), and use retry budgets.

**Migrate a stateful app between availability zones.** EBS volumes are zonal, so snapshot the volume, create a new volume in the target AZ from the snapshot (or restore through VolumeSnapshot to a PVC in the new zone), update the node affinity, and cut over with a short downtime. Or better, use application-level replication (add a replica in the new AZ, let it sync, fail over, remove the old one) for zero downtime. EFS or regional storage avoids the problem.

**A metrics pipeline drops data points at peak.** Prometheus is overloaded (scrape duration longer than the interval, high cardinality, memory), remote-write queues are backing up (check `prometheus_remote_storage_samples_dropped_total`, tune `queue_config` shards), or the receiver is throttling. Fix: reduce cardinality (relabel or drop), shard scraping (functional sharding or hashmod), scale the receivers (Mimir, Thanos, AMP), and recording rules.

**A critical alert was missed during an incident. Build redundancy and accountability.** Monitor the monitoring: a **dead man's switch** (an always-firing Watchdog alert to an external service that pages if it stops), redundant Alertmanager (clustered) and multiple notification channels, escalation policies (unacknowledged after N minutes goes to the secondary, then the manager), external synthetic checks independent of the internal stack, alert ownership in the service catalogue, and a postmortem item for every missed alert.

**Fluentd/Fluent Bit logs aren't reaching the backend.** Check the agent pods' logs (output errors, authentication or TLS failures, 4xx from Elasticsearch such as mapping conflicts, 429 throttling), buffer metrics (retries, a full buffer, dropped chunks), the input path and parser (`/var/log/containers/*.log`, CRI against Docker format), RBAC for metadata enrichment, network or DNS to the backend, and backend health (disk watermarks making indices read-only). Turn on the agent's metrics endpoint and test with a known log line.

**A custom controller is consuming high CPU.** It's probably hot-looping: reconciling on every update, including its own status writes (use the `GenerationChangedPredicate`, avoid writing unchanged status), missing back-off on errors, listing from the API instead of the informer cache, watching too many resources cluster-wide (use namespace or label scoping), or a too-short resync period. Profile with pprof and check the work queue metrics.

**Config changes aren't taking effect: validate a ConfigMap rollout.** → [Core](../core-answers.md#configmaps-secrets). Env vars need a pod restart, `subPath` mounts never update, and the app may cache config. Fix with a checksum annotation or Reloader, and verify inside the pod (`kubectl exec … cat /config/...`).

**One namespace shows degraded performance: isolate it and limit the blast radius.** Compare the namespace's resource usage against its quota, CPU throttling, noisy neighbours on shared nodes, a recent deploy, and dependency latency. Contain it with ResourceQuotas and LimitRanges, PriorityClasses, dedicated node pools, and NetworkPolicies, and use API Priority and Fairness if it's hammering the API server.

**Enforce cluster-wide policy compliance.** Kyverno or OPA Gatekeeper (admission policies: required labels, no privileged pods, trusted registries, resource limits), Pod Security Admission, policies stored in Git through GitOps, audit mode before enforce, policy reports, CI checks on manifests (kubeconform, conftest), and CIS benchmark scanning (kube-bench).

**Kyverno to strengthen security: enforcing policies on images, deployments, labels and security requirements.** Kyverno policies are Kubernetes YAML (ClusterPolicy) with **validate** (for example require `runAsNonRoot`, disallow `:latest`, require resource limits, require `team` labels), **mutate** (add default labels, securityContext or `imagePullPolicy`), **generate** (create a default-deny NetworkPolicy in every new namespace), and **verifyImages** (require cosign signatures or attestations from your registry). Start with `validationFailureAction: Audit`, review the PolicyReports, then switch to `Enforce`. Exclude system namespaces carefully.

**Audit logs filling up the disk.** Tune the **audit policy**: log metadata (not request or response bodies) for most resources, `None` for noisy read-only requests (events, health checks, `get`/`list`/`watch` by system components), RequestResponse only for sensitive writes (secrets metadata, RBAC changes). Set log rotation (`--audit-log-maxsize`, `maxbackup`, `maxage`), or send to a webhook or backend instead of local disk. On EKS, audit logs go to CloudWatch, so set retention there.

**Blue-green deployment for a Kubernetes app: key steps.** Two Deployments (`app-blue`, `app-green`) with a `version` label, a Service whose selector points at the live colour, deploy green and test it through a separate preview Service, switch the Service selector (or Ingress backend) to green, monitor, keep blue for rollback, then scale blue down. Argo Rollouts' `blueGreen` strategy automates the preview, promotion and scale-down delay. → [Core](../core-answers.md#deployment-strategies)

**A memory leak in a container but no metrics to prove it.** Get evidence directly: `kubectl top pod` sampled over time, the cgroup files (`/sys/fs/cgroup/memory.current`, `memory.stat` for anon against file), `ps`/`/proc/<pid>/status` (VmRSS) inside the container or through an ephemeral debug container sharing the process namespace, heap dumps or profilers (jmap, pprof, memray, `dotnet-counters`), and the OOM kill history in node `dmesg`. Then add the metrics (cAdvisor/Prometheus) so it never goes unproven again.

**A bad actor is scanning services from inside the cluster: detect and mitigate.** Detect with Hubble or Calico flow logs (one pod connecting to many IPs and ports), Falco rules (network scanning tools, unexpected outbound connections), GuardDuty runtime monitoring, and NetworkPolicy deny logs. Mitigate by quarantining the pod (label it and apply a deny-all NetworkPolicy), keeping it for forensics (don't delete it straight away), finding the entry point (vulnerable image, leaked token), rotating credentials, and enforcing default-deny policies cluster-wide.

**A misconfigured webhook blocks all new pod creation. Recover quickly.** List webhooks with `kubectl get validatingwebhookconfigurations,mutatingwebhookconfigurations`. Find the one failing (API server errors in events: "failed calling webhook ... connection refused"). Quick recovery: change its `failurePolicy` to `Ignore` or delete the webhook configuration (back it up first), or fix the webhook service (often its own pods can't start because of the webhook itself: a chicken-and-egg problem). Prevent it with `namespaceSelector` excluding `kube-system` and the webhook's own namespace, `failurePolicy: Fail` only where truly needed, timeouts, and HA webhook deployments.

**Simulate node failures to test HA.** Chaos tools (Chaos Mesh, LitmusChaos, AWS FIS with EKS actions) to terminate nodes or drain them during load tests, with steady-state checks (SLO metrics, synthetic requests) and automatic verification that pods rescheduled within a target time and no errors exceeded the budget. Schedule regularly, starting in non-prod.

**Global failover with Kubernetes: DNS and routing strategies.** Clusters in several regions deployed identically through GitOps, global routing through **Route 53 latency or failover records with health checks**, Global Accelerator or a global anycast load balancer (GCP), or a CDN-level origin failover. Data replication strategy per service, ExternalDNS for record management, low TTLs, and regular failover drills. → [Core: DR](../core-answers.md#dr-strategies)

**Detect infrastructure drift (red team exercise).** Terraform drift plans, AWS Config rules and the configuration timeline, Argo CD diff (out-of-sync detection with self-heal), kube-bench and Kubescape, CloudTrail anomalies, driftctl-style scanners, and Prowler or Security Hub for posture.

**Track workload cost per team in a shared cluster.** Kubecost or OpenCost (allocation by namespace and label from requests and usage × node prices, including idle and shared costs), mandatory `team` labels (enforced by Kyverno), split-cost allocation for EKS in the AWS CUR, and dashboards and showback per team. → [Meesho #2](../companies/meesho.md)

**The API server becomes unresponsive: diagnose and restore; limit the impact.** Check etcd health first (`etcdctl endpoint health`, db size, quota exceeded → compact and defrag), API server logs and metrics (`apiserver_request_duration_seconds`, inflight requests), certificate expiry, OOM of the API server, and a flood of requests (a misbehaving controller or many LIST calls, so check API Priority and Fairness metrics). On managed clusters, open a support case and check the provider's status. Reduce the impact: running workloads keep running without the API server (but no changes or self-healing happen), so run several API servers behind a load balancer, protect etcd, set APF limits, and back up etcd.

**A StatefulSet for a database is failing to create pods.** `kubectl describe sts` and pod events: PVC creation or binding issues (StorageClass, zone), the headless Service missing (required in `serviceName`), `OrderedReady` blocking pod-1 because pod-0 isn't Ready, image or config errors, fsGroup and volume permissions (the database can't write to the data directory), and node resources. Considerations: stable network IDs through the headless Service, `volumeClaimTemplates`, PDBs, anti-affinity across zones, and careful `podManagementPolicy`.

**Make sure only secure and compliant images run.** Image scanning in CI and the registry, an allowlist of registries plus `verifyImages` signature checks (Kyverno, Sigstore policy-controller), block `:latest` and require digests, base-image standards, SBOMs, and continuous rescanning with Trivy Operator. → [Core: security](../core-answers.md#k8s-security)

**Pods generating huge log files: rotation and retention.** The kubelet rotates container logs (`containerLogMaxSize`, `containerLogMaxFiles` in the kubelet config). Ship logs to a central store with retention policies (Fluent Bit → Loki or OpenSearch with ILM), reduce verbosity (log levels, sampling), and never write logs to `emptyDir` without size limits (`sizeLimit`, `ephemeral-storage` limits).

**Debugging a CRD that doesn't behave as expected.** Check the CRD schema (validation errors on apply), `kubectl explain <kind>`, `kubectl describe <cr>` for status conditions and events, controller pod logs (it's usually the controller, not the CRD), conversion webhooks (versions), admission webhooks, RBAC of the controller (`kubectl auth can-i --as=system:serviceaccount:ns:sa`), and whether the controller watches the right namespace.

**Monitoring and logging for EKS; EKS updates; EKS worker nodes.** → [Nvidia SRE](../companies/nvidia.md)

**Real-world EKS issues you've faced.** For example: IP exhaustion in subnets (fixed with prefix delegation and a secondary CIDR), CoreDNS throttling (NodeLocal DNSCache), `aws-auth` mistakes locking people out (moved to access entries), EBS volumes stuck on a dead node during an AZ issue, Karpenter consolidation disrupting batch jobs (`do-not-disrupt` annotation), and image pull rate limits from Docker Hub (mirrored to ECR).

**EKS cluster with 4 nodes, but only 2 should reach a particular SQL Server.** Put those 2 nodes in a dedicated node group with a label and taint, and use a dedicated **security group** (or subnet) that the SQL Server's security group or firewall allows. Schedule the workloads that need the database there with node affinity and tolerations. Finer still: **Security Groups for Pods** (VPC CNI) so only specific pods carry the allowed security group, or NetworkPolicies plus egress rules. Check connectivity with `nc -zv sqlhost 1433` from a debug pod.
