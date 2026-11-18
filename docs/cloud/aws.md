---
tags:
  - cloud
  - aws
---

# AWS

**Certification:** AWS Certified Solutions Architect – Associate

## Reliability building blocks

- **Regions and Availability Zones**: spread workloads across at least two AZs.
- **Elastic Load Balancing + Auto Scaling groups**: replace unhealthy instances automatically.
- **Multi-AZ RDS**: synchronous standby with automatic failover.
- **S3**: versioning and lifecycle rules; cross-region replication for disaster recovery.
- **Route 53**: health checks with failover routing.

## Well-Architected pillars

Operational excellence · Security · Reliability · Performance efficiency · Cost optimization · Sustainability

## Handy CLI

```bash
aws sts get-caller-identity                          # who am I?
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,Tags[?Key==`Name`]|[0].Value]' \
  --output table
aws logs tail /aws/lambda/<function> --follow
```

## To write next

- VPC design: public/private subnets, NAT, endpoints
- IAM least privilege and permission boundaries
