---
tags:
  - security
---

# Cloud security

My learning path from reliability engineering into cloud security.

## Learning path

- [x] IAM fundamentals on AWS, Azure and GCP
- [x] Kubernetes RBAC
- [ ] Kubernetes security: Pod Security Standards, NetworkPolicies, image scanning
- [ ] Secrets management: HashiCorp Vault, cloud secret managers, External Secrets Operator
- [ ] Cloud security posture: CIS benchmarks, AWS Security Hub, Microsoft Defender for Cloud
- [ ] Supply chain security: SBOMs, image signing with Sigstore cosign
- [ ] Certification target: CKS (Certified Kubernetes Security Specialist)

## Quick hardening checklist

- [ ] MFA on all human accounts, no root/owner account for daily work
- [ ] Least-privilege IAM roles. No long-lived access keys in CI; use OIDC
- [ ] Encryption at rest and in transit by default
- [ ] Audit logging on (CloudTrail / Activity Log / Cloud Audit Logs) and shipped to a separate account
- [ ] No public storage buckets unless intended and reviewed
- [ ] Containers run as non-root with read-only root filesystems where possible
- [ ] Dependency and image scanning in the CI pipeline
