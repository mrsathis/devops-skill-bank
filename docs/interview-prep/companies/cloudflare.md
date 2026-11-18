---
tags:
  - interview
  - sre
---

# Cloudflare: Senior SRE and Staff Platform Engineer

## Senior SRE: Round 1 (systems design)

**Design a global anycast network that keeps serving when an entire data centre disappears.**

Every data centre announces the **same IP prefixes** over BGP. Routers send users to the nearest (by BGP path) location. If a data centre fails or withdraws its routes, BGP reconverges and traffic flows to the next-nearest location automatically. Requirements:

- Each location is self-sufficient (stateless edge, local config and caches).
- Health checks withdraw announcements automatically when a location is unhealthy.
- Capacity headroom so neighbours can absorb a failed location's traffic.
- Long-lived TCP connections reset on failover, so clients retry.
- Avoid routing asymmetry problems, and use regional prefixes for traffic engineering.

**How would you roll out a config change to 300+ edge locations safely?**

- Validate and lint it, and test it against recorded traffic.
- Stage it: internal or dogfood locations, then a few low-traffic locations, then 1%, 10% and global, with **automatic health checks between stages** (error rate, CPU, latency).
- Make every stage revertible quickly with a global kill switch.
- Never push a global config instantly. Lessons from real outages: a bad WAF regex and a bad bot-management file propagated globally within seconds.
- Version configs and keep the previous version loaded for instant rollback.

**Design a DDoS mitigation pipeline that drops attack traffic without dropping legitimate users.**

Layered:

- **L3/L4**: anycast spreads the attack across all locations, then XDP/eBPF filters drop packets early in the kernel by signature (fingerprints from sampled traffic), with SYN cookies and rate limiting per source.
- **L7**: request fingerprinting, rate limits, challenges (JS, managed challenge) instead of outright blocks for borderline traffic, reputation, and bot scores.
- **Detection**: per-location sampling and anomaly detection that generates signatures automatically and pushes them out in seconds.

Minimise false positives by challenging rather than dropping when unsure, and by measuring the legitimate-traffic success rate.

**How do you manage BGP changes safely? What guardrails prevent a bad route announcement?**

- Config generated from a source of truth (not hand-typed), peer review, and automated validation (prefix lists, max-prefix limits, RPKI/ROA validation, IRR filters).
- Staged rollout per router or location, and pre and post checks (session state, route counts, traffic shift).
- Automatic rollback.
- Outbound prefix filters so you can only announce your own prefixes, and maintenance windows.

**How would you design a canary system for edge software when traffic differs by region?**

Compare each canary against a **baseline in the same location** (not a global average) with similar traffic: canary and control machines side by side in the same data centre. Choose canary locations that cover diverse traffic profiles (regions, customer types, protocols). Use per-location statistical analysis, longer bake times for low-traffic locations, and promote region by region.

## Senior SRE: Round 2 (RCA and troubleshooting)

**A single regex deployed globally pegs CPU on every edge node at once. Find it and stop the bleeding.**

1. **Stop the bleeding first**: use the global kill switch to disable the rule or feature, or roll back the config. Don't wait for root cause.
2. **Find it**: correlate the CPU spike with the latest config push, use `perf top` or flame graphs on an edge node showing time in the regex engine, and identify the rule.
3. **Root cause**: catastrophic backtracking (for example `.*(?:.*=.*)`) on certain inputs.
4. **Prevent it**: a regex engine with linear-time guarantees (RE2 or Rust `regex`), CPU limits per rule, a staged rollout for WAF rules, and performance tests of rules against adversarial input.

**5xx errors spike for one ASN only. Your debugging path.**

One ASN means a network path or a customer-specific issue. Check:

- Which locations serve that ASN, and whether the errors are concentrated in one location (an issue local to that location, or peering).
- Whether the errors come from the edge or the origin.
- Whether that ASN's traffic has a specific pattern (an attack mitigation false positive, rate limiting, a client type).
- Routing changes with that ASN (BGP updates, a peering link down, MTU or path issues causing TLS failures).

Engage the network team or ISP with traceroutes and packet captures.

**DNS resolution is slow, but authoritative servers look healthy. Where's the problem?**

Between the user and the authoritative servers:

- The **recursive resolvers**: ISP resolver overload, cache misses, or DNSSEC validation issues.
- Network latency or packet loss on UDP 53, truncation forcing TCP retries (large responses, EDNS buffer size).
- Low TTLs causing more misses.
- Clients' search domains (`ndots`).
- Anycast routing users to a far-away node.

Measure from the client side with RIPE Atlas or synthetic probes, `dig +trace` and the resolver's own statistics.

**A kernel upgrade rolled to 10% of the fleet and packet drops appear. Isolate the cause.**

Compare upgraded against non-upgraded nodes side by side: `ethtool -S` and `/proc/net/softnet_stat` drop counters, `nstat`, ring buffer sizes, driver and firmware versions, offload settings (GRO/TSO), changed sysctl defaults, and XDP/eBPF program compatibility. Bisect by rolling back a few nodes. Halt the rollout and roll back the 10% while you investigate.

**Your dashboards are down during the incident. How do you debug without them?**

Go to the source: SSH or console to the machines, `top`, `ss`, `journalctl`, logs on the box, `curl` health endpoints directly, load balancer and CDN provider status, packet captures, and querying Prometheus or the log store's API directly if only the UI is down. Keep a minimal **out-of-band monitoring** path (a separate stack or external synthetics) for exactly this, and have runbooks that don't depend on the dashboards.

## Senior SRE: Round 3 (leadership and judgement)

**You need to roll back a global change, but the rollback itself is risky. How do you decide?**

Compare the risk of each option: the ongoing user impact of staying broken (and how it's trending) against the rollback's blast radius and failure modes. Options: roll back in stages (a few locations first, verify, then the rest), roll forward with a narrow fix, or use a kill switch for just the broken feature. Decide quickly with the incident commander, state the abort criteria, and communicate.

**Write a blameless postmortem for an outage that hit millions of sites.** → [Core: postmortems](../core-answers.md#postmortem). Include customer impact in clear numbers, a precise timeline, why safeguards didn't catch it, and systemic fixes (staged rollouts, kill switches, testing). Publish a public version if appropriate.

**Balance shipping speed against blast radius.** Ship fast but small: progressive rollouts, cells and shards, feature flags, automated canaries, and error budgets. Speed comes from making each change safe, not from skipping steps.

**Communicating publicly during an active incident.** Post early (acknowledge within minutes), state clearly what's affected, update on a fixed schedule even when there's no news, don't speculate on the cause, give workarounds, and follow up with an honest postmortem.

---

## Staff Platform Engineer

**Design an internal platform that lets hundreds of teams deploy safely across 300+ data centres without making every team a Kubernetes expert.**

- A **paved road**: a service template plus a simple service spec (name, resources, routes, SLO, dependencies) that the platform turns into deployment manifests, rollout policy, monitoring and alerts.
- Progressive global rollout built in (rings and canaries, as above), policy guardrails (resources, security), and self-service through a portal or CLI.
- Teams own their service's behaviour, the platform owns the mechanics.
- Escape hatches for advanced teams, with ownership clearly defined.

**Balance self-service with guardrails around reliability, security and cost.** Guardrails as code (admission policies, quotas, budgets) that block dangerous actions and warn on risky ones. Defaults that are safe, with exceptions requiring review. Make the safe path the easiest one.

**Which abstractions belong in the platform, and which should stay visible to engineers?** Hide undifferentiated mechanics (cluster details, certificates, networking plumbing, rollout machinery). Keep visible what engineers need to reason about their service: resource usage, health, SLOs, logs and traces, rollout status, and failure modes. Leaky abstractions that hide the information needed to debug are worse than none.

**A platform change increases tail latency for a small but critical group of services. Isolate the cause and reduce the blast radius.** Identify what those services share (node pool, sidecar version, library, location, traffic shape). Roll the platform change back for that group first (per-service rollout control), then compare profiles before and after. In future, roll platform changes out by service tier, critical services last.

**The last platform incident you owned.** Use STAR, covering what failed, the decision you made under pressure, and what changed. → [Core: behavioural](../core-answers.md#behavioural)

**Measure whether the platform improves productivity rather than adding process.** DORA metrics before and after, time to first deploy, adoption (voluntary use), surveys and NPS, support tickets per team, and the number of manual steps removed.

**Build vs adopt.** Adopt when an existing tool covers most needs and isn't your differentiator. Build when your scale or constraints are unique (300+ locations) and the capability is core, considering the long-term ownership cost.

**Competing demands from app teams, security and infrastructure.** Make the trade-offs explicit, use shared goals (SLOs, risk register, cost), set priorities with stakeholders in a transparent roadmap, and look for solutions that serve several needs (secure defaults that are also simple).

**A platform teams use versus one they're forced to tolerate.** Teams choose a good platform because it saves them time. It has good docs, quick feedback, an escape hatch, and treats developers as customers. A tolerated platform is mandated, slow and opaque, and teams work around it.
