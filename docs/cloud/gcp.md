---
tags:
  - cloud
  - gcp
---

# Google Cloud

**Certification:** Google Cloud Associate Cloud Engineer

## Resource hierarchy

Organization → Folders → Projects → Resources. Billing, APIs and IAM are scoped per project.

## Reliability building blocks

- **Managed instance groups**: autohealing and autoscaling, regional for multi-zone spread.
- **Global external Application Load Balancer**: one anycast IP in front of backends in many regions.
- **GKE Autopilot**: Google manages the nodes, you manage the workloads.
- **Cloud Storage**: dual-region and multi-region buckets.

## Handy CLI

```bash
gcloud config list
gcloud projects list
gcloud compute instances list
gcloud container clusters get-credentials <cluster> --region <region>
```
