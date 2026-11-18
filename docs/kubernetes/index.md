---
tags:
  - kubernetes
---

# Kubernetes

Notes from running Kubernetes in production and preparing for the CKA.

## Notes in this section

- [kubectl troubleshooting runbook](kubectl-troubleshooting.md): from "pod is broken" to root cause.

## Core concepts checklist

- [x] Pods, ReplicaSets, Deployments, StatefulSets, DaemonSets
- [x] Services (ClusterIP, NodePort, LoadBalancer) and Ingress
- [x] ConfigMaps and Secrets
- [x] RBAC: Roles, ClusterRoles, bindings, ServiceAccounts
- [x] Scheduling: taints/tolerations, node affinity, resource requests/limits
- [x] Cluster upgrades and etcd backup/restore with kubeadm
- [ ] NetworkPolicies in depth
- [ ] Operators and CRDs
- [ ] GitOps with Argo CD or Flux

## Next notes to write

- Helm basics
- etcd backup and restore
- NetworkPolicy patterns
