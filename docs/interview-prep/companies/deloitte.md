---
tags:
  - interview
---

# Deloitte: DevOps Engineer

## Round 1: Technical screening

**Explain the CI/CD workflow you follow. How do you define and invoke pipelines in Jenkins?** → [Core: CI/CD](../core-answers.md#cicd-pipeline). Define the pipeline in a `Jenkinsfile` (declarative) in the repo, use a Multibranch Pipeline or Organization Folder job that discovers branches and PRs, and trigger it with SCM webhooks. → [Core: Jenkins](../core-answers.md#jenkins)

**What are Jenkins shared libraries? How are they written and used?** → [Core: Jenkins](../core-answers.md#jenkins). Example `vars/buildDockerImage.groovy`:

```groovy
def call(Map args) {
  sh "docker build -t ${args.image}:${env.GIT_COMMIT} ."
  sh "docker push ${args.image}:${env.GIT_COMMIT}"
}
```

In a Jenkinsfile: `@Library('ci-lib@v2') _` then `buildDockerImage(image: 'registry/app')`. Configure the library under *Manage Jenkins → System → Global Pipeline Libraries*, and version it with tags.

**What applications do you deploy with Jenkins, and which deployment tools?** For example Java Spring Boot and Node.js microservices as containers, deployed to EKS with Helm (or Argo CD through GitOps), infrastructure with Terraform, and VM configuration with Ansible.

**The Jenkins pipeline runs but the build doesn't happen. Possible causes?** No agent matching the label (the job stays queued: "Waiting for next available executor"), offline agents, a `when` condition or branch filter skipping stages, a webhook triggering the wrong branch or job, SCM checkout returning no changes, a skipped stage after an earlier `input` or `catchError`, a build step that's a no-op because a variable or path is wrong, a disabled job, or the controller's quiet period. Check the console log and the build queue.

**What is the purpose of a webhook in CI/CD?** An HTTP callback: when an event happens (a push or PR in GitHub, GitLab or Bitbucket), the SCM POSTs a payload to Jenkins (`/github-webhook/`) to trigger the pipeline straight away, instead of polling. Secure it with a secret or token, and allowlist the source IPs.

**How do you create and manage Kubernetes clusters (with Terraform)? What are master and worker nodes?** Use Terraform with the `terraform-aws-modules/eks` module (VPC, cluster, managed node groups or Karpenter, add-ons, IRSA) through a pipeline, with state in S3. The control plane (master) runs the API server, etcd, scheduler and controllers, and workers run the kubelet, the runtime and kube-proxy. → [Core: architecture](../core-answers.md#k8s-architecture)

**Common Kubernetes errors you've faced and how you resolved them?** CrashLoopBackOff (a missing secret, fixed by adding it to the External Secrets mapping), ImagePullBackOff (an expired registry token or a missing ECR permission), Pending (requests too high), OOMKilled (a JVM heap not container-aware). → [Core](../core-answers.md#crashloopbackoff)

**The command to get into a pod, and how you create a Kubernetes object.** `kubectl exec -it <pod> -n <ns> -- /bin/sh` (add `-c <container>` for multi-container pods). Create objects declaratively with `kubectl apply -f manifest.yaml`, or imperatively with `kubectl create deployment web --image=nginx` or `kubectl run`. Use `--dry-run=client -o yaml` to generate manifests.

**Folder structure of a basic Helm chart, and the commands to deploy with it.** → [Core: Helm](../core-answers.md#helm)

```
mychart/
  Chart.yaml        # name, version, appVersion, dependencies
  values.yaml       # default values
  templates/        # deployment.yaml, service.yaml, ingress.yaml, _helpers.tpl, NOTES.txt
  charts/           # subchart dependencies
  .helmignore
```

`helm upgrade --install app ./mychart -n prod -f values-prod.yaml --atomic --wait`

## Round 2: In-depth technical

**Branching strategy, avoiding broken release branches, and fixing a production bug.** → [Core: branching](../core-answers.md#branching). Protected branches, required PR checks, and merging only through reviewed PRs keep the release branch stable.

**Typical deployment flow, Jenkins stages, and ensuring full quality checks.** Stages: checkout → build → unit tests → SonarQube with a **quality gate** (`waitForQualityGate abortPipeline: true`) → dependency and image scans → push → deploy to dev → integration tests → approval → prod. → [Core: CI/CD](../core-answers.md#cicd-pipeline)

**How do you use Jenkins shared libraries?** See above.

**Security scanning for Docker images, during the build and in the registry.** At build time: **Trivy** or Grype in the pipeline (`trivy image --exit-code 1 --severity CRITICAL,HIGH --ignore-unfixed app:sha`), and Dockerfile linting (hadolint). In the registry: **ECR enhanced scanning (Inspector)** or ACR with Defender, Harbor with Trivy, rescanning continuously as new CVEs appear. At deploy time: admission policies that only allow scanned and signed images.

**Passing environment variables during Docker build; where do you store images?** Use `ARG` for build-time values (`docker build --build-arg VERSION=1.2 .`) and `ENV` to keep them at runtime. Never pass secrets as build args (they appear in image history). Use BuildKit secrets for those. Store images in ECR, ACR, GCR/Artifact Registry, Docker Hub private repos, or Artifactory/Harbor.

**How do you connect to databases in your deployments?** Apps read the connection string or host from config (a ConfigMap) and credentials from a secret store (Secrets Manager through External Secrets, or IRSA with IAM database authentication), over TLS. Network access is limited by security groups or NetworkPolicies. Schema migrations run as a pipeline step or a Kubernetes Job (Flyway, Liquibase).

**How do you handle authentication for EKS and store secrets securely?** Humans: IAM Identity Center (SSO) roles mapped through **EKS access entries** (or the older `aws-auth` ConfigMap) to Kubernetes RBAC groups, via `aws eks update-kubeconfig`. Workloads: IRSA or EKS Pod Identity. Secrets: AWS Secrets Manager plus External Secrets Operator, and KMS envelope encryption for Kubernetes Secrets. → [Core: secrets](../core-answers.md#configmaps-secrets)

## Round 3: Hiring manager

Project experience, day-to-day responsibilities, behavioural and culture-fit questions. → [Core: behavioural](../core-answers.md#behavioural)
