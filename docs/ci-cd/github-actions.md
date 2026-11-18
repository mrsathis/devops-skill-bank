---
tags:
  - ci-cd
---

# GitHub Actions

**Level:** Intermediate · **Real example:** this site is deployed by GitHub Actions
(see `.github/workflows/deploy.yml` in the repo).

## Anatomy of a workflow

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: pytest
```

- **Workflow**: a YAML file in `.github/workflows/`.
- **Trigger** (`on`): push, pull_request, schedule, workflow_dispatch and more.
- **Job**: runs on a fresh runner. Jobs run in parallel unless linked with `needs`.
- **Step**: a shell command (`run`) or a reusable action (`uses`).

## Good practices

- Give each workflow the least `permissions` it needs.
- Authenticate to clouds with **OIDC** instead of long-lived access keys stored as secrets.
- Pin third-party actions to a full commit SHA.
- Use `concurrency` to stop two deploys racing each other.
- Use `environment` protection rules for production approvals.

## Container build and push example

```yaml
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
- uses: docker/build-push-action@v6
  with:
    push: true
    tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
```
