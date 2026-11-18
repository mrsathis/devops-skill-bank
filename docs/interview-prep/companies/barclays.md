---
tags:
  - interview
---

# Barclays: DevOps Engineer

**The application is healthy, but users get intermittent timeouts. Is it the application, network, infrastructure or load balancer?**

Narrow it down layer by layer, using where the timing is spent:

- **Load balancer metrics**: `TargetResponseTime` against client-side latency. If the load balancer sees fast responses but clients time out, look at the network or the client path. Check `ELB_5XX` against target errors, surge queue or spillover, idle-timeout mismatches (the app's keep-alive must be longer than the load balancer's).
- **Per-target or per-AZ breakdown**: one bad instance, node or AZ.
- **App traces**: slow dependency spans, pool exhaustion, GC.
- **Network**: packet loss and retransmits (`ss -ti`, VPC flow logs), conntrack exhaustion, DNS latency, NAT port exhaustion for outbound calls.
- **Synthetic checks** from several locations to see whether it's all clients or a region or ISP.

**A deployment succeeded, but response time went from 200 ms to 3 s. Your approach?** Treat the deploy as the prime suspect: compare metrics by version (if canary or rolling, split p99 by pod version), check what changed (code, dependency versions, config such as pool sizes or timeouts, new queries or missing indexes, logging level), and look at traces of slow requests on the new version. If the impact is significant, **roll back first** and investigate afterwards. → [Core: latency](../core-answers.md#latency-normal-resources)

**A pipeline stable for months suddenly fails with no pipeline changes.** → [Core: sudden pipeline failure](../core-answers.md#pipeline-sudden-failure)

**A production deployment failed halfway, leaving different service versions running. Recover with minimal customer impact.**

1. **Stabilise**: pause or stop the rollout so it doesn't continue.
2. **Assess**: are old and new versions compatible (API contracts, schema)? If not, customers may be seeing errors, so act fast.
3. **Pick one direction**: roll everything back to the last known good version (`helm rollback`, `rollout undo`, revert the GitOps commit), or roll forward if the fix is trivial and the failure was environmental.
4. **Verify** with health checks and SLIs.
5. **Prevent**: backward-compatible changes, version-pinned deploys of the whole release set, automatic rollback on failed health gates, contract tests.

**A container keeps restarting, but there are no application errors in the logs. What next?** The container is being *killed*, not crashing: check `kubectl describe` for **OOMKilled** (exit 137), **liveness probe** failures (events show "Liveness probe failed"), evictions, or exit code 0 (the process finished). Also check whether the app logs to a file instead of stdout, or crashes before the logger starts. → [Core: CrashLoopBackOff](../core-answers.md#crashloopbackoff)

**Dashboards look healthy, but customers report slow performance.** The dashboards measure the wrong thing or average it away: look at **p99 and p99.9, not averages**, client-side RUM data, synthetic user journeys, third-party front-end dependencies (CDN, scripts), DNS and TLS time, and segment by region or device. Then add SLIs that reflect the user experience. → [Core: observability](../core-answers.md#observability)

**Migrate manually managed infrastructure to Terraform without disrupting production.**

1. Inventory resources (AWS Config, tags, Resource Explorer).
2. Write code per component and **import** existing resources (import blocks with generated config).
3. Run `plan` until there are **zero changes**, which proves the code matches reality. Never apply a plan with unexpected changes on imported resources.
4. Start with low-risk components, add `prevent_destroy` to critical ones, and lock down console write access once each component is managed.
5. Then move changes through PRs and pipelines. → [Core: import](../core-answers.md#tf-import)

**A critical vulnerability is found in a production container image. Immediate actions and long-term prevention.**

- **Immediate**: assess exploitability (is the vulnerable package used or reachable? is the service exposed?), check for signs of exploitation, mitigate (WAF rule, network restriction, disable the feature), rebuild with the patched base image or dependency, scan, and deploy through the normal pipeline (fast-tracked). Find every other image with the same package (registry scan or SBOM search).
- **Long-term**: continuous registry rescanning, automatic base-image updates (Renovate or Dependabot), minimal and distroless bases, SBOMs, policies blocking critical CVEs with fixes, and a patch SLA by severity.

**Reduce infrastructure costs by 30% without hurting performance or availability.** → [Core: cost reduction](../core-answers.md#cost-reduction) and [Meesho](meesho.md)

**The most challenging production incident you've handled: troubleshooting, communication and prevention.** Use STAR. → [Core: incident response](../core-answers.md#incident-response) and [behavioural](../core-answers.md#behavioural)
