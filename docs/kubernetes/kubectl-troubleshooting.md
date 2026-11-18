---
tags:
  - kubernetes
  - runbook
---

# kubectl troubleshooting runbook

**Level:** Intermediate · **Use when:** a workload is down, restarting or unreachable.

## 1. Get the big picture

```bash
kubectl get nodes -o wide
kubectl get pods -A --field-selector=status.phase!=Running
kubectl get events -A --sort-by=.lastTimestamp | tail -30
```

## 2. Read the pod status

```bash
kubectl get pod <pod> -n <ns> -o wide
kubectl describe pod <pod> -n <ns>     # check the Events section at the bottom
```

| Status | Usual cause | Where to look |
|---|---|---|
| `Pending` | Not enough CPU/memory, taints, unbound PVC | `describe pod` events, `kubectl describe node` |
| `ImagePullBackOff` / `ErrImagePull` | Wrong image name/tag, missing pull secret, registry down | `describe pod` events |
| `CrashLoopBackOff` | App exits on start: bad config, missing env/secret, failing probe | `kubectl logs --previous` |
| `OOMKilled` | Memory limit too low or a leak | `describe pod` → Last State, then raise the limit or fix the app |
| `CreateContainerConfigError` | Referenced ConfigMap/Secret or key doesn't exist | `describe pod` events |
| `Running` but not `Ready` | Readiness probe failing | Probe config, `kubectl logs` |

## 3. Logs

```bash
kubectl logs <pod> -n <ns>                    # current container
kubectl logs <pod> -n <ns> --previous         # the crashed container
kubectl logs <pod> -n <ns> -c <container>     # multi-container pods
kubectl logs deploy/<name> -n <ns> --since=15m
```

## 4. Get inside

```bash
kubectl exec -it <pod> -n <ns> -- sh
# Image has no shell? Attach a debug container:
kubectl debug -it <pod> -n <ns> --image=busybox:1.36 --target=<container>
```

## 5. Networking: is the Service wired up?

```bash
kubectl get svc <svc> -n <ns>
kubectl get endpointslices -n <ns> -l kubernetes.io/service-name=<svc>
```

No endpoints means the Service `selector` doesn't match the pod labels, or no pods are Ready.

```bash
# Test DNS and reachability from inside the cluster
kubectl run tmp --rm -it --image=busybox:1.36 --restart=Never -- \
  sh -c 'nslookup <svc>.<ns>.svc.cluster.local && wget -qO- http://<svc>.<ns>:<port>'
```

## 6. Nodes

```bash
kubectl describe node <node>     # Conditions: MemoryPressure, DiskPressure, Ready
kubectl top nodes                # needs metrics-server
kubectl top pods -n <ns> --sort-by=memory
```

On the node itself: `systemctl status kubelet` and `journalctl -u kubelet --since "15 min ago"`.

## 7. Roll back a bad deploy

```bash
kubectl rollout history deploy/<name> -n <ns>
kubectl rollout undo deploy/<name> -n <ns>
kubectl rollout status deploy/<name> -n <ns>
```

!!! tip "Gotcha"
    `kubectl logs` shows only the current container. After a crash, the useful lines are usually in
    `--previous`.
