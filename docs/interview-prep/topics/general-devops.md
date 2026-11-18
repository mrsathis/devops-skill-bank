---
tags:
  - interview
---

# General DevOps, project and coding questions (company not named)

## DevOps fundamentals

**What is DevOps and why does it matter? Key benefits.** A culture and set of practices that bring development and operations together around **shared ownership of delivering and running software**: automation (CI/CD, IaC), fast feedback, measurement and continuous improvement. Benefits: faster and more frequent releases, lower change failure rate, faster recovery (the DORA metrics), better collaboration, and scalable, consistent environments.

**DevOps vs Agile.** Agile improves **how software is planned and built** (iterative development, close collaboration with the business). DevOps extends that **through delivery and operations** (deploying, running, monitoring), removing the wall between dev and ops. They complement each other: Agile produces small increments, DevOps ships and runs them safely and quickly.

**What is "shift left"?** Moving testing, security and quality checks **earlier** in the lifecycle (in the IDE, pre-commit hooks, PR pipelines) so problems are found when they're cheapest to fix: SAST and dependency scanning on PRs, IaC scanning before apply, contract tests, threat modelling at design time.

**Common DevOps tools and their uses.** Git (version control), Jenkins, GitHub Actions or GitLab CI (CI/CD), Docker (containers), Kubernetes (orchestration), Terraform (IaC), Ansible (configuration), Helm and Argo CD (deployment and GitOps), Prometheus/Grafana (monitoring), ELK/Loki (logging), SonarQube and Trivy (quality and security), Vault (secrets), Artifactory or Nexus (artefacts).

**How do you approach IaC? Immutable infrastructure.** → [Core: Terraform](../core-answers.md#tf-environments). **Immutable infrastructure**: servers and containers are never patched in place. Every change builds a new image (AMI or container) and replaces the old instances. This removes configuration drift, makes rollbacks easy (redeploy the previous image) and makes environments reproducible.

**Monolith vs microservices.** A **monolith** is one deployable unit: simple to develop, test and deploy at small scale, but coupled releases and scaling, and it gets harder with many teams. **Microservices** are independently deployable services around business capabilities: independent scaling and releases, team autonomy, technology choice, but operational complexity (networking, observability, distributed data, consistency). Choose based on team size and needs. A modular monolith is often the right start.

**Do you know YAML? What did you do with it? YAML syntax.** YAML is a human-readable data format used for Kubernetes manifests, Helm values, CI pipelines (GitHub Actions, GitLab, Azure DevOps), Ansible playbooks and Docker Compose. Syntax: indentation with **spaces** (no tabs) defines structure, `key: value` maps, `- item` lists, `|` for literal multi-line and `>` for folded, anchors and aliases (`&base`, `*base`, `<<:`) for reuse, `---` separates documents. Common pitfalls: indentation errors, unquoted values being misread (`yes`/`no`/`on` in YAML 1.1, leading zeros, colons).

**Day-to-day activities of a DevOps engineer; how effectively you used Kubernetes and Docker day to day; your roles and responsibilities.** → [Accenture](../companies/accenture.md). Be concrete: tickets and requests handled, pipelines owned, clusters operated, on-call duties, and improvements you delivered.

**How do you overcome hurdles in DevOps?** Common hurdles are cultural (silos, resistance to change), technical debt, and skills. Approaches: start with small visible wins, measure and share results, automate the painful work first, involve teams early, train and pair, use blameless postmortems, and get leadership sponsorship.

**What is testing (in a DevOps context)?** Automated verification at every stage: unit, integration, contract, end-to-end, performance and load, security (SAST, DAST, SCA), infrastructure tests (terratest, policy checks), and production verification (smoke tests, synthetics, canary analysis). Tests are the safety net that makes fast delivery possible.

**Exposure to Kubeflow?** Kubeflow is an ML platform on Kubernetes (pipelines, notebooks, training operators, KServe model serving). Answer honestly. If you haven't used it, relate it to what you know: "it's Kubernetes operators and pipelines for ML workloads, so the same cluster, GitOps and observability practices apply, plus GPU scheduling."

**Ansible: tasks you've done; a playbook to install Git; the run command; push or pull; agent or agentless; how it knows what to install on an EC2 instance; language used; what and why.**

```yaml
# install-git.yml
- name: Install git
  hosts: web
  become: true
  tasks:
    - name: Ensure git is present
      ansible.builtin.package:
        name: git
        state: present
```

Run it with `ansible-playbook -i inventory.ini install-git.yml` (`--check --diff` for a dry run). Ansible is **agentless** (SSH/WinRM, needs Python on Linux targets) and **push-based** by default (`ansible-pull` gives a pull mode). It knows *what* to install from the **playbook and roles** you write (the desired state), and *where* from the **inventory** (static, or a dynamic EC2 inventory plugin selecting hosts by tags). Playbooks are **YAML**, modules are mostly Python, templates are **Jinja2**. It's used for configuration management, app deployment and orchestration, idempotently.

**Ansible Vault; Ansible roles.** → [Accenture](../companies/accenture.md)

## Project and experience questions

**Tell me about yourself / your current project / technical experience / tools and technologies used.** Structure (about 2 minutes): current role and scope → main platforms and tools with scale (clusters, services, users) → two achievements with numbers → what you're looking for and why this role. Keep it consistent with your CV.

**Recent critical issue / production issue you troubleshot / incident you handled.** Use STAR with technical detail: symptoms, how you narrowed it down (which metrics, logs and commands), root cause, fix, and the prevention you added. → [Core: behavioural](../core-answers.md#behavioural)

**How many microservices / EKS clusters / servers / which domain (banking, insurance) / have you worked in production?** Give honest, specific numbers and context. Explain *why* the environment is shaped the way it is. Interviewers test whether your experience is real through follow-ups.

**A time you proactively identified a problem or opportunity and acted without being asked.** STAR: noticed (for example certificates managed manually, or rising NAT costs) → investigated with data → proposed and built a fix (automation or architecture change) → measurable result (outages avoided, $ saved) → how you shared it.

## Coding and fundamentals (from the SRE checklist post)

**Programming (Python, Go, Bash).**

- *A CPU monitoring script*: Python with `psutil.cpu_percent(interval=1)` in a loop, alerting when it's over a threshold for N consecutive samples. Or Bash reading `/proc/stat` deltas or `mpstat`.
- *Automating log analysis*: stream-parse logs (`for line in sys.stdin`, regex or JSON parsing), aggregate counts by status, path or error with `collections.Counter`, and output the top N. Or `awk '{print $9}' access.log | sort | uniq -c | sort -rn`.
- *Goroutines, channels, mutexes*: goroutines are lightweight concurrent functions scheduled by the Go runtime. **Channels** pass data between them safely (share memory by communicating). Use a `sync.Mutex` to protect shared state when channels don't fit, `WaitGroup` to wait for completion, and `context` for cancellation.
- *Exponential backoff*: `delay = min(cap, base * 2**attempt)` with **jitter** (`random.uniform(0, delay)`), a maximum number of attempts, only for retryable errors, respecting `Retry-After`.
- *Multiprocessing vs multithreading*: in CPython the **GIL** lets only one thread execute Python bytecode at a time, so **threads** suit I/O-bound work (network, disk) and **processes** (multiprocessing) suit CPU-bound work. Go uses goroutines across all cores.
- *Detecting memory leaks*: monitor RSS over time, take heap snapshots and diff them (tracemalloc, memray, pprof, jmap), look for growing caches or collections, unclosed resources and reference cycles.

**Data structures and algorithms.**

- *LRU cache*: a hash map + doubly linked list for O(1) get and put (or Python `OrderedDict` with `move_to_end` and `popitem(last=False)`).
- *Top K frequent*: count with a hash map, then a min-heap of size K (O(n log k)) or bucket sort (O(n)).
- *Linked-list cycle*: Floyd's tortoise and hare (slow and fast pointers meet if there's a cycle).
- *Rate limiter*: token bucket (refill rate r, capacity b) or sliding-window counters. Distributed, use Redis with atomic Lua scripts or `INCR` + `EXPIRE` per window.
- *Hash map collisions*: chaining (lists per bucket) or open addressing (linear or quadratic probing), with resizing when the load factor goes over a threshold.
- *Sliding window / two pointers*: maintain a window `[l, r]` and expand or contract it to satisfy a constraint (longest substring without repeats, subarray sums), O(n).

**System design and distributed systems.**

- *URL shortener*: an API to create (generate an ID through a counter with base62 or a hash plus collision check), a key-value store for `id → url`, cache hot keys, 301 or 302 redirects, analytics asynchronously through a queue, rate limiting, and custom aliases.
- *Distributed rate limiter*: a token bucket in Redis (Lua script for atomic check and decrement) keyed by user or API key, with local caches for scale, and graceful failure behaviour (fail open or closed by endpoint).
- *CAP and eventual consistency*: → [SRE topic: CAP](sre-observability.md)
- *Replication vs sharding*: **replication** copies the same data to several nodes (availability, read scaling). **Sharding** splits data across nodes by key (write and storage scaling). Most large systems do both.
- *Systems for millions of users*: stateless services behind load balancers, caching (CDN, Redis), async processing with queues, a database with replicas and sharding, multi-AZ and multi-region, and observability and autoscaling.

## The "70 DevOps interview questions" list

Questions from that list are answered across these pages:

| Area | Where |
|---|---|
| General concepts (DevOps, Agile, shift left, tools, CI vs CD, version control) | This page, [CI/CD](cicd-git.md) |
| CI/CD (pipeline from scratch, stages, secrets, testing, zero downtime, rollbacks, artefacts, dependencies) | [CI/CD](cicd-git.md), [Core](../core-answers.md#cicd-pipeline) |
| Containers and orchestration (Docker, VMs vs containers, Compose, Kubernetes, pods, secrets, Ingress, scaling, service mesh) | [Docker](docker.md), [Kubernetes](kubernetes.md) |
| Cloud (IaaS/PaaS/SaaS, IaC, HA, cloud-native, cost, auto-scaling, security, tagging, DR, storage) | [AWS and cloud](aws-cloud.md) |
| Monitoring and logging (importance, setup, tools, observability, log aggregation, metrics vs logs, microservices, alerting, securing data, tracing) | [SRE and observability](sre-observability.md) |
| IaC (what, how, tools, immutable infrastructure) | This page, [Terraform](terraform.md) |
