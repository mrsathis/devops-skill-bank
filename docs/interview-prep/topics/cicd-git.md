---
tags:
  - interview
  - ci-cd
---

# CI/CD, Jenkins and Git questions (company not named)

## CI/CD concepts and design

**What is CI/CD? CI vs CD; Continuous Delivery vs Continuous Deployment.** **CI**: every change is merged often and automatically built and tested. **Continuous Delivery**: every change that passes the pipeline is *releasable*, and production deploys are a manual business decision (one click). **Continuous Deployment**: every passing change goes to production **automatically**, with no human gate. Both need strong automated tests and safe rollout and rollback.

**Explain the end-to-end pipeline from commit to production; implement CI/CD from scratch; common stages; main components.** → [Core](../core-answers.md#cicd-pipeline)

**Walk through your pipeline (DevSecOps interviewer's view); what blocks your build and what only warns?** Commit → secret and code scan → build → tests → image scan → sign → push → deploy with OIDC short-lived credentials. **Block** on: failing tests, a critical or high vulnerability *with a fix available*, leaked secrets, a quality gate failure, policy violations (public bucket, privileged pod). **Warn and open a ticket** on low or medium findings, unfixable CVEs (with an expiry on the exception), and coverage dips. Be explicit about the line between them. "We scan everything" isn't an answer.

**Why that tool and not another?** Give a real constraint. For example, "we moved from Terraform to CloudFormation for one product because AWS Marketplace required CloudFormation templates", or "GitHub Actions because the code lived on GitHub and OIDC removed stored keys". Specific constraints show real experience.

**Which CI/CD tools have you used, and how do you choose one?** Jenkins, GitHub Actions, GitLab CI, Azure DevOps, Argo CD, Bamboo. Choose based on where the code lives, hosting model (SaaS or self-hosted for compliance and private networks), security features (OIDC, environments), ecosystem and plugins, scale and cost, and team skills. Prefer fewer, standardised tools.

**Pipeline optimisation for faster deployments; 18-minute builds of 40 images.** → [Core](../core-answers.md#pipeline-speed). For 40 images: build only changed ones, BuildKit with registry cache, parallel builds on several runners, shared base images, and smaller contexts through `.dockerignore`.

**Handling failures midway; a release failed and logs are inconclusive; improving pipeline observability.** Make deploy stages **atomic or reversible** (Helm `--atomic`, blue-green), automatic rollback on failed health checks, verbose logs on failure, artefacts of logs and test reports, pipeline metrics (duration, failure rate per stage), traces of pipeline runs (OpenTelemetry CI integrations), notifications with links, and reproducible agents. → [Core: rollback](../core-answers.md#rollback)

**Securing secrets in pipelines; protecting CI/CD pipelines; preventing secrets exposure.** → [Core](../core-answers.md#cicd-secrets)

**Integrating unit, integration and performance tests so they don't become a bottleneck.** → [J.P. Morgan #16](../companies/jp-morgan.md). Run them in parallel and sharded, use test impact analysis, keep fast tests on PRs, move long performance suites to nightly or pre-release runs, and use ephemeral environments for integration tests.

**Deploy the same code to dev, staging and prod with config differences.** Build once, promote the same artefact, keep config per environment outside the artefact (Helm values per environment, Kustomize overlays, variable groups, a parameter store), use the same pipeline template for each environment, and validate config in CI. → [Wipro #26](../companies/wipro.md)

**Monorepo with many services: build and deploy only affected services.** Path-based triggers (`paths:` filters, GitLab `rules: changes`), or build tools with dependency graphs (Nx, Bazel, Turborepo, Pants) computing affected targets against the merge base, dynamic child pipelines per service, and caching.

**Blue-green and canary in a pipeline; which for high traffic?** → [Core](../core-answers.md#deployment-strategies). For high traffic, **canary** with automated analysis (smallest blast radius, decisions on real data).

**Versioning builds and artefacts; traceability.** Semantic versions for releases plus build metadata, images tagged with the **git SHA** (immutable) and promoted by digest, artefact repositories with retention, labels or annotations (`org.opencontainers.image.revision`, source URL), SBOMs and provenance attestations (SLSA), and deployments recorded with version → commit → work item.

**Artefact repositories: their purpose.** → [Accenture](../companies/accenture.md)

**Managing dependencies in CI/CD.** Lock files (`package-lock.json`, `poetry.lock`, `go.sum`), proxy or mirror repositories (Artifactory, Nexus) to cache and control what comes in, automated update PRs (Renovate, Dependabot), SCA scanning, and pinned base images and tool versions.

**Rollback mechanisms; automated rollback.** → [Core](../core-answers.md#rollback)

**Zero-downtime deployments.** → [Core](../core-answers.md#zero-downtime)

**GitLab CI/CD pipeline for a microservices app; self-hosted vs GitLab-managed runners.** `.gitlab-ci.yml` with stages (build, test, scan, package, deploy), `include:` shared templates, `rules:` for path-based jobs, `needs:` for a DAG of parallel jobs, environments with deployments and manual `when: manual` jobs for prod, and the GitLab Agent for Kubernetes (GitOps). **GitLab.com runners**: zero maintenance, but billed minutes, public networking and generic specs. **Self-hosted runners** (Docker, Kubernetes executor, autoscaling): private network access, custom tools, bigger machines and caching, but you secure and maintain them.

**GitLab YAML syntax for parallel jobs; Groovy for running a dependent job afterwards.**

```yaml
# GitLab: jobs in the same stage run in parallel; `parallel:` fans out one job; `needs:` builds a DAG
stages: [build, test, deploy]
build: { stage: build, script: [make build] }
unit-tests:
  stage: test
  parallel: 4                         # 4 parallel copies (CI_NODE_INDEX/CI_NODE_TOTAL)
  script: [make test SHARD=$CI_NODE_INDEX]
lint: { stage: test, script: [make lint] }
deploy:
  stage: deploy
  needs: [unit-tests, lint]           # runs as soon as both finish
  script: [make deploy]
```

```groovy
// Jenkins declarative: parallel stages, then a dependent stage; or trigger a downstream job
pipeline {
  agent any
  stages {
    stage('Tests') {
      parallel {
        stage('Unit') { steps { sh 'make unit' } }
        stage('Lint') { steps { sh 'make lint' } }
      }
    }
    stage('Deploy') { steps { sh 'make deploy' } }          // runs after both succeed
  }
  post { success { build job: 'smoke-tests', wait: false } } // dependent downstream job
}
```

**Configure a pipeline to run manually.** GitLab: `when: manual` (or `rules: - when: manual`). GitHub Actions: `on: workflow_dispatch` (with `inputs`). Jenkins: no triggers, plus parameters, or an `input` step for manual gates. Azure DevOps: `trigger: none` and run from the UI, or environment approvals.

**Shell scripting in CI/CD: an example of automation; why shell scripting matters in DevOps; its limitations.** Example: a script that waits for a deployment's health endpoint with a timeout and fails the pipeline, or one that tags and pushes images and updates the GitOps repo. Shell is everywhere, great for gluing CLIs together and quick automation. Its limitations: weak error handling (use `set -euo pipefail`), no real data structures, hard to test and maintain, platform differences, and quoting pitfalls. Switch to Python or Go when logic grows.

**Pipeline pass criteria with SonarQube.** The **quality gate**, for example on *new code*: no new blocker or critical issues, coverage ≥ 80%, duplication ≤ 3%, security hotspots reviewed, and Reliability, Security and Maintainability ratings of A. The pipeline waits for the gate result (`waitForQualityGate`) and fails if it doesn't pass.

**Automated tests in the CD pipeline?** Yes: smoke tests after each deploy, API and integration tests in staging, synthetic checks in production, and contract tests. The results gate promotion.

**Methods to check code vulnerabilities.** SAST (SonarQube, Semgrep, CodeQL), SCA (Snyk, Dependabot, OWASP Dependency-Check), secret scanning (gitleaks, push protection), container and IaC scanning (Trivy, Checkov), DAST (ZAP), plus code review and threat modelling.

**Manage pipeline configuration and permissions.** → [Accenture](../companies/accenture.md)

**Deployments succeed but frequent failures continue even though everything is automated.** Automation can't fix low-quality inputs: look at the **change failure rate** by cause, missing test coverage for the failure classes (integration and contract tests), environment parity gaps, config drift, oversized releases (ship smaller), missing progressive delivery and health gates, flaky dependencies. Run postmortems on deploy failures and fix the systemic gaps.

**How do you communicate between a Jenkins server and a Kubernetes cluster?** The Jenkins **Kubernetes plugin** runs agents as pods (Jenkins talks to the API server with a ServiceAccount token or kubeconfig credential). Deploy steps use `kubectl`/`helm` with a kubeconfig stored in Jenkins credentials (for EKS, `aws eks update-kubeconfig` with an IAM role on the agent). Better: push only to Git and let Argo CD inside the cluster pull (no cluster credentials in Jenkins).

**How do you handle CD in your projects?** Describe it: GitOps with Argo CD, environment promotion through PRs, canary through Argo Rollouts, approvals for prod, automatic rollback.

**Explain your CI/CD workflow / detailed pipeline.** → [Core](../core-answers.md#cicd-pipeline)

**Deploying via Bamboo: build and deploy plans; automatic trigger on commit; linked repositories.** Bamboo separates **build plans** (stages → jobs → tasks that produce artefacts) from **deployment projects** (environments that deploy a *release* made from a build's artefacts). Triggers: repository polling, or **webhooks / Bitbucket Server integration** that triggers on push. **Linked repositories** are repositories defined once globally (with credentials) and reused by many plans, so access is managed centrally.

## Jenkins

**What is Jenkins? Pipeline? Jenkinsfile? Nodes, controller/agent (master/slave) architecture; adding jobs for agents; running on specific agents with labels (70 agents).** → [Core: Jenkins](../core-answers.md#jenkins)

**Declarative vs scripted pipelines; Groovy in Jenkins; where Jenkinsfiles are saved.** → [Core](../core-answers.md#jenkins). Groovy is the JVM scripting language that pipelines are written in (scripted pipelines are pure Groovy, declarative is a Groovy DSL). Jenkinsfiles are stored **in the application's Git repo** (root by default) so the pipeline is versioned with the code. Shared logic goes in shared libraries.

**Build triggers: manual, scheduled, automatic; scheduling tasks in Jenkins; cron vs Jenkins scheduling.** Triggers: SCM webhooks, `pollSCM`, `cron` (`triggers { cron('H 2 * * 1-5') }`, where `H` spreads load with a hash), upstream or downstream jobs, remote API or token, manual. Jenkins scheduling compared with system **cron**: Jenkins gives logs, history, notifications, retries, credentials, distributed agents and a UI. Cron is simpler, local and has no visibility. Use Jenkins (or Kubernetes CronJobs) for team-visible jobs.

**Managing plugins; securing Jenkins.** Install and upgrade through the Plugin Manager or **as code** (`plugins.txt` with `jenkins-plugin-cli` in a custom image, plus JCasC for configuration). Keep plugins minimal and current (most CVEs are in plugins), test upgrades in staging, and back up `JENKINS_HOME`. Security: → [Core](../core-answers.md#jenkins)

**Integrating Jenkins with GitHub/GitLab.** The GitHub Branch Source (or GitLab) plugin, Multibranch or Organization Folder jobs discovering repos, branches and PRs, webhooks for triggers, GitHub App credentials (better than personal tokens), and commit status checks reported back to PRs.

**Credentials in Jenkins; generating credentials from a pipeline; preventing exposure.** → [Core](../core-answers.md#cicd-secrets). Generate on demand: fetch **dynamic, short-lived secrets** from Vault (database credentials with a TTL) or assume a cloud role through OIDC at runtime, instead of storing static ones. To generate a random password: `openssl rand -base64 24`, written straight to the secret store, never echoed.

**Freestyle vs Pipeline jobs.** **Freestyle**: UI-configured, simple, not version-controlled, limited flow control. **Pipeline**: code (Jenkinsfile), versioned and reviewable, stages, parallelism, `input` approvals, durable across controller restarts, shared libraries. Always use Pipeline for real work.

**Implement approval before production deployment.** Jenkins `input` step (with `submitter` restricted to a group, and a timeout), GitHub or Azure DevOps environments with required reviewers, GitLab protected environments with approvals, or change-management integration (ServiceNow).

**Integrate SonarQube and Trivy in Jenkins.**

```groovy
stage('SonarQube') {
  steps {
    withSonarQubeEnv('sonar') { sh 'mvn -B sonar:sonar' }
    timeout(time: 10, unit: 'MINUTES') { waitForQualityGate abortPipeline: true }
  }
}
stage('Image scan') {
  steps {
    sh 'trivy image --exit-code 1 --severity CRITICAL,HIGH --ignore-unfixed $IMAGE:$TAG'
  }
}
```

**Jenkins pipeline syntax.** Declarative: `pipeline { agent … environment {…} options {…} parameters {…} triggers {…} stages { stage('x') { when {…} steps {…} } } post { always/success/failure {…} } }`

**Change the Jenkins port; default home directories for controller and agent; running agents as root?** → [Core](../core-answers.md#jenkins). Never run agents as root: use a dedicated `jenkins` user, rootless container builds (Kaniko, BuildKit rootless, Buildah), and no Docker-socket mounts on shared agents.

**Separate CI and CD pipelines in Jenkins: how and with which triggers?** CI: a multibranch job triggered by webhooks on every push or PR (build, test, scan, push the image, publish metadata). CD: a separate job triggered by successful CI on `main` (`upstream` trigger or `build job:` with the image tag parameter), or by the artefact or registry event, with environment stages and approvals. Or replace CD with GitOps.

**A Jenkins pipeline fails but the app works locally.** The environment is different. Compare tool versions on the agent (JDK, Node, Maven), env vars and credentials, network access (proxy, private registries), file paths and case sensitivity, a missing `.env` or local config not in Git, workspace leftovers (clean the workspace), resources (memory or disk), and tests depending on local state. Reproduce by running the agent's container image locally. Pin tool versions in the pipeline.

**A production deployment fails and Jenkins catches it: rollback, and your responsibilities.** → [Core](../core-answers.md#rollback). Your responsibilities: trigger or verify the rollback, confirm recovery with metrics, communicate with stakeholders, preserve logs and artefacts, and lead or contribute to the RCA.

**Jenkins master-agent: what if you have 70 agents?** Use labels and pools, cloud or Kubernetes ephemeral agents instead of static machines, monitor executor utilisation, and use JCasC to manage agent templates.

## Git

**Merge vs rebase; when to use each; handling merges; resolving conflicts.** → [Core](../core-answers.md#merge-vs-rebase). Resolving conflicts: `git status` lists the conflicted files, edit the conflict markers (or use a merge tool), run the tests, `git add` and continue (`git merge --continue` / `git rebase --continue`). Prevent them with small, frequent merges.

**Undo a bad commit already pushed to main.** → [Core](../core-answers.md#git-revert)

**Move specific code changes to another branch.** `git cherry-pick <sha>` (or a range `A^..B`) onto the target branch. For only part of a commit: `git checkout source-branch -- path/to/file`, or `git cherry-pick -n` and stage selectively (`git add -p`).

**Branching strategy; feature vs release branch; who merges code in your team?** → [Core](../core-answers.md#branching). A **feature branch** holds one change until it's merged through a PR. A **release branch** stabilises a version for release (only fixes go in) while main moves on. Merges happen through PRs after required reviews (CODEOWNERS) and checks, merged by the author or a maintainer, never by direct push.

**What is git squash? What is git stash?** **Squash** combines several commits into one (`git rebase -i` with `squash`/`fixup`, or a "squash and merge" PR) for a clean history. **Stash** saves uncommitted changes to a stack and cleans the working tree (`git stash push -m msg`, `git stash pop`/`apply`, `list`) so you can switch context.

**Where is the Git commit history stored?** In the repository's **`.git` directory**: objects (commits, trees and blobs, compressed and content-addressed by SHA) in `.git/objects` (and packfiles), with refs (branches and tags) in `.git/refs` and `packed-refs`. Each clone holds the full history locally.

**Protect sensitive information from being pushed to GitHub.** `.gitignore` for env and key files, **pre-commit hooks** with gitleaks or detect-secrets, GitHub **secret scanning push protection**, environment variables and secret stores instead of files, reviews, and if a secret leaks: rotate it straight away and purge the history. → [Core: leaked key](../core-answers.md#leaked-key)

**Version control in a DevOps environment.** Everything as code in Git (app, IaC, pipelines, config, docs), PR-based reviews with protected branches, signed commits, trunk-based development, tagging releases, and Git as the source of truth for GitOps.
