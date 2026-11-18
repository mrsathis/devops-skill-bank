---
tags:
  - iac
---

# Terraform

**Level:** Intermediate

## Core workflow

```bash
terraform init        # download providers, configure backend
terraform fmt -recursive
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

## Remote state (AWS example)

```hcl
terraform {
  required_version = ">= 1.6"

  backend "s3" {
    bucket       = "my-tf-state-bucket"
    key          = "skill-bank/prod/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true   # S3-native state locking (Terraform 1.10+)
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

## Good practices

- Keep state remote, encrypted and locked. Never commit `.tfstate` files.
- One state per environment and per blast radius (networking separate from apps).
- Pin provider and module versions.
- Run `plan` in CI on every pull request and `apply` only from `main`.
- Use modules for repeated patterns, but don't wrap every resource in one.

## Useful commands

```bash
terraform state list
terraform state show <address>
terraform import <address> <id>      # or use import blocks in config
terraform plan -refresh-only          # detect drift
```
