---
tags:
  - interview
---

# Wipro: DevOps Engineer (5–8 years)

## Linux and shell scripting

**1. Troubleshoot high CPU and memory on Linux.** → [Core: high CPU](../core-answers.md#high-cpu). For memory: `free -h` (look at *available*, not *free*, because page cache is reclaimable), `ps aux --sort=-%mem | head`, `smem`, `vmstat 1` (si/so means swapping), `dmesg | grep -i oom`, slab usage (`slabtop`), and check for leaks over time.

**2. Identify disk I/O bottlenecks.** `iostat -xz 1` (`%util` near 100, high `r_await`/`w_await`, `aqu-sz`), `iotop` or `pidstat -d 1` for the process, `vmstat` `wa`, `sar -d`. In the cloud, check EBS limits (volume IOPS and throughput, gp2 burst credits, the instance's EBS bandwidth cap). Fix with gp3 with provisioned IOPS, caching, batching writes, moving logs off the data disk, and query and index optimisation.

**3. A Bash approach to monitor and restart a failed service.**

```bash
#!/usr/bin/env bash
svc=${1:-nginx}
if ! systemctl is-active --quiet "$svc"; then
  logger -t svc-watch "$svc is down, collecting diagnostics and restarting"
  journalctl -u "$svc" -n 50 --no-pager > "/var/tmp/${svc}-$(date +%s).log"
  systemctl restart "$svc"
  sleep 5
  systemctl is-active --quiet "$svc" || logger -t svc-watch "restart of $svc FAILED"
fi
```

Better: let systemd do it (`Restart=on-failure`, `RestartSec=5`, `StartLimitBurst`), and alert through monitoring instead of cron scripts.

**4. Troubleshoot DNS or connectivity from Linux.** `dig name` / `dig @8.8.8.8 name` (compare resolvers), `cat /etc/resolv.conf`, `resolvectl status`, `getent hosts name` (uses nsswitch, including `/etc/hosts`), `ping`/`mtr` for the path, `nc -zv host port` or `curl -v` for the port, `ss -tn` for state, `traceroute -T -p 443`, `tcpdump -i any port 53`, plus firewall rules (`iptables -L -n`, `firewall-cmd --list-all`).

**5. Safely manage processes, signals and system resources.** Graceful stops with SIGTERM (`kill <pid>`, `systemctl stop`) before SIGKILL, `nice`/`renice` for priority, `ulimit` and systemd resource controls (`CPUQuota`, `MemoryMax`, `LimitNOFILE`) to cap resources, `cgroups` through systemd slices. Avoid `kill -9` on databases. → [Core: processes](../core-answers.md#linux-processes)

**6. Investigate a sudden spike in open file descriptors.** → [Core: inodes and FDs](../core-answers.md#inodes-fds)

**7. Automate log cleanup without affecting running services.** Use **logrotate** with `copytruncate` (for apps that can't reopen logs) or `postrotate` signals (`nginx -s reopen`, `systemctl reload`), compression, retention (`rotate 7`, `maxage`), and size triggers. Never `rm` a log a process has open (the space isn't freed). Truncate it instead. For journald, `SystemMaxUse`. For containers, use the runtime's log rotation. Ship logs centrally so the local copy can be short-lived.

## Docker and containers

**8. Optimise a large Docker image.** → [Core: image size](../core-answers.md#image-size)
**9. Multi-stage builds for production.** → [Core: multi-stage](../core-answers.md#multi-stage)
**10. A container that keeps exiting.** → [Core: container restarts](../core-answers.md#container-restarts)
**11. Securely manage secrets in containers.** → [Core: container secrets](../core-answers.md#container-secrets)
**12. How do Docker networking modes affect service communication?** → [Core: Docker networking](../core-answers.md#docker-networking)

**13. Reduce container startup time.** Smaller images (faster pulls) and pre-pulled or cached images on nodes, lazy-loading images (SOCI on AWS, stargz), less work at startup (no dependency installs or migrations in the entrypoint), JVM tuning (CDS/AppCDS, CRaC, or native images with GraalVM), lazy initialisation, correct startup probes so traffic isn't delayed unnecessarily, and warm pools.

## Kubernetes

**14. CrashLoopBackOff.** → [Core](../core-answers.md#crashloopbackoff)
**15. Pending pods caused by scheduling constraints.** → [Core](../core-answers.md#pending-pods)
**16. A Service returning 503.** → [Core](../core-answers.md#pods-running-503)
**17. How readiness and liveness probes affect availability.** → [Core](../core-answers.md#probes)

**18. Configure HPA for unpredictable traffic.** Scale on a metric that leads load (requests per second or concurrency through KEDA or Prometheus Adapter) rather than lagging CPU, set an aggressive `scaleUp` policy (no stabilisation window, allow doubling quickly) with a conservative `scaleDown`, keep `minReplicas` high enough for sudden bursts, make sure node autoscaling is fast (Karpenter, overprovisioning placeholder pods), and keep startup quick. → [Core: HPA](../core-answers.md#hpa)

**19. When to use rolling, blue-green or canary.** → [Core](../core-answers.md#deployment-strategies)
**20. Manage application configuration and secrets.** → [Core](../core-answers.md#configmaps-secrets)

**21. Troubleshoot node-level failures in EKS/AKS/GKE.** `kubectl describe node` (conditions: Ready, MemoryPressure, DiskPressure, PIDPressure, NetworkUnavailable), events, then on the node: kubelet and runtime logs (`journalctl -u kubelet -u containerd`), disk and inodes, CNI agent health (aws-node, azure-cni, cilium), the cloud console (instance status checks, scaling events). Usually cordon, drain and replace the node, then root-cause from the logs. Managed options: EKS node auto repair, AKS auto-repair, GKE auto-repair.

**22. How do Helm charts support reusable deployments?** → [Core: Helm](../core-answers.md#helm). One chart, parameterised by values files per environment, versioned, with library charts for shared templates.

## CI/CD

**23. Design a secure Jenkins or GitHub Actions pipeline.** → [Core: secrets](../core-answers.md#cicd-secrets). Least-privilege `permissions:`, actions pinned to a SHA, OIDC to the cloud, protected environments with reviewers, branch protection, ephemeral runners, no secrets in PRs from forks, SAST/SCA/secret/image scanning, signed artefacts.

**24. A deployment succeeds but the application fails. How do you debug it?** Check that the new pods actually run the expected image and config, read app logs and events, readiness status, the diff of config and secrets, dependency connectivity, and smoke tests. Roll back if users are affected. Then add post-deploy smoke tests and health gates so "success" means healthy, not just "applied".

**25. Automated rollback in CI/CD.** → [Core: rollback](../core-answers.md#rollback)

**26. Manage artefacts across environments.** Build once, store versioned immutable artefacts (images by digest, packages) in a repository (ECR, Artifactory, Nexus), and **promote the same artefact** from dev to prod (retag or copy between repos), never rebuild per environment. Keep environment config separate, and record provenance (commit, build ID, SBOM). Retention policies clean up old artefacts.

**27. Add quality and security gates to a pipeline.** Unit test pass and coverage threshold, SonarQube quality gate, linting, SAST, SCA (no critical CVEs with a fix), secret scanning, image scanning, IaC scanning, policy checks (OPA), plus manual approval for prod. Gates must be fast and clear about why they failed.

**28. Prevent concurrent deployments from conflicting.** Serialise per environment: Jenkins `options { disableConcurrentBuilds() }` or the Lockable Resources plugin, GitHub Actions `concurrency: group: deploy-prod, cancel-in-progress: false`, Terraform state locking, GitOps (a single reconciler applies changes in order), and deployment queues or merge queues.

## Cloud and infrastructure

**29. Design highly available infrastructure on AWS/Azure/GCP.** → [Core: HA on AWS](../core-answers.md#aws-ha). The same pattern on Azure (availability zones, VMSS or AKS, zone-redundant SQL) and GCP (regional MIGs or GKE, regional Cloud SQL).

**30. How do load balancers and auto scaling work together?** The ASG registers new instances with the load balancer's target group. The load balancer only sends traffic once health checks pass, and the ASG can use **ELB health checks** to replace instances that fail them. Scaling policies (target tracking on CPU or `ALBRequestCountPerTarget`) add or remove instances. On scale-in, the load balancer drains connections (deregistration delay) before termination, and lifecycle hooks allow graceful shutdown.

**31. DR for a critical service.** → [Core: DR](../core-answers.md#dr-strategies)
**32. Sudden cloud cost increases.** → [Core: cost](../core-answers.md#cost-reduction)

**33. Secure S3/ADLS/GCS data and access.** Block public access (account-level), least-privilege IAM and bucket policies (deny non-TLS, require encryption, restrict to VPC endpoints or org), encryption with KMS or CMK, versioning plus Object Lock for ransomware protection, access logging and CloudTrail data events, Macie or Purview for sensitive-data discovery, private endpoints, short-lived pre-signed URLs or SAS for sharing, and lifecycle policies.

**34. Design networking between private cloud workloads.** Hub-and-spoke with **Transit Gateway** (AWS), Virtual WAN or a hub VNet (Azure), or NCC or Shared VPC (GCP). Plan non-overlapping CIDRs (IPAM), PrivateLink for service-to-service exposure without full routing, segmentation through route tables and security groups, centralised egress or inspection, private DNS (Route 53 Resolver rules), and hybrid links through VPN or Direct Connect. → [Topic: AWS networking](../topics/aws-cloud.md#tgw-vs-peering)

## Terraform

**35. Structure Terraform for multiple environments.** → [Core](../core-answers.md#tf-environments)
**36. State locking and drift.** → [Core: state](../core-answers.md#tf-state), [drift](../core-answers.md#tf-drift)
**37. Safely manage secrets in Terraform.** → [Core](../core-answers.md#tf-secrets)
**38. How do modules improve large-scale infrastructure management?** → [Core](../core-answers.md#tf-environments)
**39. Recover from a failed Terraform deployment.** → [Core](../core-answers.md#tf-partial-apply)
