---
tags:
  - interview
---

# J.P. Morgan: DevOps / Cloud

## Round 1: Technical (hands-on and conceptual)

**1. Docker image vs container?** → [Core](../core-answers.md#image-vs-container)

**2. How does Kubernetes manage scaling and self-healing?** Controllers continuously reconcile desired state: the ReplicaSet controller replaces deleted or failed pods, the kubelet restarts crashed containers (restart policy) and liveness failures, the node controller evicts pods from dead nodes so they're rescheduled, readiness removes unhealthy pods from Services, the HPA scales replicas from metrics, and node autoscalers add nodes for Pending pods. → [Core: HPA](../core-answers.md#hpa), [node down](../core-answers.md#node-down)

**3. Explain CI/CD and its stages in Azure DevOps or Jenkins.** → [Core: CI/CD](../core-answers.md#cicd-pipeline)

**4. Load balancer vs reverse proxy?** → [Core](../core-answers.md#lb-vs-proxy)

**5. Handling secrets in a CI/CD pipeline securely.** → [Core](../core-answers.md#cicd-secrets)

**6. Blue-green vs canary.** → [Core](../core-answers.md#deployment-strategies)

**7. What are runbooks and how are they used in incident response?** Documented, step-by-step procedures for a known alert or operational task: what the alert means, impact, diagnosis steps with exact commands and dashboards, mitigation, escalation contacts, and verification. Every alert should link to one. They cut MTTR and reliance on one person's knowledge, and good ones get automated over time (runbook automation through SSM documents or Rundeck). A runbook can be *worse than none* when it's outdated or wrong, so review them after incidents.

**8. Debug high CPU on a Linux VM.** → [Core](../core-answers.md#high-cpu)

**9. What is IaC? How is Terraform different from ARM templates?** IaC means defining infrastructure in versioned, declarative code that's reviewed and applied by automation, so it's reproducible, auditable and consistent. **ARM** (and Bicep, its friendlier language) is Azure-native, has no state file (Azure itself is the source of truth), and supports new Azure features on day one. **Terraform** is multi-cloud and multi-provider (also GitHub, Datadog, Kubernetes), uses HCL and a state file, runs a plan before applying, and has a big module ecosystem. → [Core: Terraform](../core-answers.md#tf-state)

**10. Log aggregation in a microservices architecture.** Apps log **structured JSON to stdout** with a correlation or trace ID, node-level agents (Fluent Bit, Vector, the OTel Collector as a DaemonSet) collect and enrich them with Kubernetes metadata, ship them to a central store (Elasticsearch/OpenSearch, Loki, Splunk, CloudWatch or Azure Log Analytics) with retention tiers, then searched and linked from traces. Control volume and cost with sampling, log levels and dropping noisy logs. Handle PII masking and access control.

**11. What is a service mesh, and when should you use Istio or Linkerd?** A dedicated infrastructure layer (sidecar or ambient proxies plus a control plane) that handles service-to-service traffic: **mTLS** and identity, traffic management (retries, timeouts, canary routing, circuit breaking), and uniform telemetry, without app code changes. Use it when you have many services and need zero-trust mTLS, fine-grained traffic control or consistent observability. Skip it for a handful of services, because it adds operational and latency overhead. Linkerd is simpler and lighter. Istio is more feature-rich.

**12. Migrating workloads from on-prem to Azure or AWS.** Discover and assess (inventory, dependencies, performance), choose a 7R strategy per app (rehost, replatform, refactor, repurchase, retire, retain, relocate), build the landing zone, migrate in waves (pilot first), replicate data (Azure Migrate or AWS MGN for servers, DMS for databases), test, cut over with a rollback plan, then optimise. → [Topic: migration](../topics/aws-cloud.md#migration)

**13. Rolling update vs Recreate strategy in Kubernetes.** → [Core: rolling update](../core-answers.md#rolling-update)

**14. Zero-downtime deployments.** → [Core](../core-answers.md#zero-downtime)

**15. Common causes of HTTP 403 or 500 in cloud environments.** **403**: IAM or RBAC denies (missing permission, SCP, resource policy such as an S3 bucket policy or KMS key policy), WAF blocking, a signed URL expired, CORS-related denials, Azure storage firewall or private endpoint restrictions, a wrong app-level auth scope. **500**: unhandled app exceptions, bad config or secrets, a dependency failure surfaced as 500, timeouts. Troubleshoot with the load balancer, WAF and app logs, CloudTrail or Activity Log (`errorCode: AccessDenied`), and traces. → [Core: 5xx](../core-answers.md#http-5xx)

**16. Automating testing in your CI/CD pipeline.** A test pyramid: unit tests on every commit (fast, parallel), integration and contract tests (Testcontainers, Pact) on PRs, API and end-to-end smoke tests after deploying to dev or staging, performance tests (k6, JMeter) on a schedule or before releases, security tests (SAST/DAST). Gate promotion on results, quarantine flaky tests, and publish reports.

**17. How do you monitor infrastructure and services?** Metrics (Prometheus or Azure Monitor/CloudWatch) with USE dashboards for infrastructure and RED for services, logs centralised, traces with OpenTelemetry, synthetic checks for key journeys, SLOs with burn-rate alerts to on-call through PagerDuty or Opsgenie, runbooks linked. → [Core: observability](../core-answers.md#observability)

**18. Azure DevOps Boards and Repos: tracking delivery progress.** Boards: epics → features → user stories and tasks, sprints, Kanban, and work items linked to commits and PRs (`AB#123`) so deployments trace back to work. Dashboards with velocity, burndown and cumulative flow. Repos: branch policies (reviewers, build validation, linked work items required).

**19. Application Gateway vs API Gateway.** Azure **Application Gateway** is a regional L7 load balancer for web traffic: path and host routing, TLS termination, **WAF**, autoscaling, and an AKS ingress option. An **API gateway** (Azure API Management, AWS API Gateway) manages APIs as products: authentication (keys, OAuth/JWT validation), rate limits and quotas, request and response transformation, versioning, a developer portal, and analytics. They're often used together: App Gateway (WAF) in front of APIM.

**20. A challenging incident you solved in production.** Use STAR. → [Core: behavioural](../core-answers.md#behavioural)

## Round 2: HR and managerial

Tell me about yourself; why J.P. Morgan; a disagreement with a teammate; an urgent production issue; what motivates you; prioritising multiple issues; ownership beyond your role; keeping up to date; a failure you learned from; a strict deadline; cross-functional or remote teams; long-term goals; stress and burnout; improving a process; your ideal work environment.

**How to answer them:** prepare STAR stories that map to several questions (one incident story covers "urgent issue", "ownership" and "improved a process"). For prioritisation, explain how you triage by business impact and urgency (incidents affecting customers first, then deadlines, communicating trade-offs). For "why J.P. Morgan", link the scale and regulated environment of a global bank to your reliability and security interests. For stress, describe concrete habits (blameless culture, on-call hygiene, time-boxing, asking for help). → [Core: behavioural](../core-answers.md#behavioural)
