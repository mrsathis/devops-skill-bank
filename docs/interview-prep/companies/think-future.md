---
tags:
  - interview
---

# Think Future Technologies: DevOps Engineer (4 years)

## Terraform and infrastructure

**1. How would you trigger an Ansible playbook automatically when running `terraform destroy`?** Use a **destroy-time provisioner**: a `provisioner "local-exec"` block with `when = destroy` and `command = "ansible-playbook -i '${self.private_ip},' decommission.yml"` on the resource (or on a `terraform_data` resource that depends on it). Destroy-time provisioners can only reference `self`, not other resources. Provisioners are a last resort, and if one fails the destroy fails (`on_failure = continue` changes that). A cleaner approach is to run the playbook as a pipeline step *before* `terraform destroy`.

**2. How do you get logs from an EC2 user-data script after it has run?** On Amazon Linux and Ubuntu, cloud-init writes them to `/var/log/cloud-init-output.log` (script stdout and stderr) and `/var/log/cloud-init.log`. The script itself is at `/var/lib/cloud/instance/scripts/part-001`. Without SSH: **EC2 → Get system log** (console output) or SSM. Better: ship those logs to CloudWatch with the agent.

**3. How do you verify whether the user-data script succeeded or failed?** `cloud-init status --long` (done or error), the exit status in `/var/log/cloud-init-output.log`, `/var/lib/cloud/data/result.json` for errors. Add `set -euxo pipefail` to the script so it fails loudly, and signal success: write a marker file, publish a CloudWatch metric or SSM parameter, or use an ASG **lifecycle hook** or CloudFormation `cfn-signal` so the instance only goes into service when the script succeeded.

**4. The Terraform state file is lost. What happens, and how do you recover?** → [Core: lost state](../core-answers.md#tf-state-lost)

**5. Resources created manually in AWS: how do you bring them under Terraform? Any approach beyond `terraform import`?** → [Core: import](../core-answers.md#tf-import). Beyond the CLI: **`import` blocks** with `-generate-config-out` (Terraform 1.5+), **Terraformer** or the AWS CloudFormation IaC generator to reverse-engineer existing resources, or recreate them through Terraform and migrate (blue-green) when import is messy.

## Docker: hands-on scenario

**6. A dockerised Node.js app won't stay running and isn't accessible. Troubleshoot and fix it.**

1. `docker ps -a` for status and exit code, `docker logs <id>`.
2. Common causes: the app listens on `localhost` (must bind `0.0.0.0` inside the container), the wrong port mapping (`-p host:container` must match the app's port), the CMD exits (for example `npm start` fails because dependencies are missing or the wrong working directory), env vars missing.
3. Rebuild and run with the correct mapping, and verify with `curl localhost:<port>`.

**Live scenario: a Node.js app in `/home/admin/app` must serve on port 8888, but `curl localhost:8888` doesn't return the expected response. Something else may already be on that port. Make exactly one container serve "Hello World!" on 8888 (`node:15.7-alpine` is local, no root).**

```bash
# 1) What's on 8888 right now?
docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep 8888   # a stale/other container?
ss -ltnp | grep 8888                                              # or a non-docker process (may need root to see PID)

# 2) Stop/remove the conflicting container(s) you own
docker stop <old_id> && docker rm <old_id>

# 3) Check how the app listens: port and host inside the container
grep -nE "listen|PORT" /home/admin/app/*.js
#    app must listen on 0.0.0.0 (or no host) and on the port you map

# 4) Build and run exactly one container
cd /home/admin/app
cat Dockerfile          # FROM node:15.7-alpine ... CMD ["node","app.js"]; fix EXPOSE/CMD if wrong
docker build -t hello-app .
docker run -d --name hello -p 8888:<app_port> --restart unless-stopped hello-app

# 5) Verify
curl -s localhost:8888    # -> Hello World!
docker ps                 # exactly one container publishing 8888
```

If a non-Docker process you can't stop owns 8888, you can't bind there without root, so say so and escalate. Don't silently pick another port, because the requirement is 8888.

## Configuration management and security

**7. Have you used Ansible? For what?** For example: OS hardening and patching, installing and configuring agents (CloudWatch, node_exporter), deploying apps to VMs, rotating certificates, user management. Mention roles, Vault, dynamic inventory and idempotency.

**8. An NGINX instance receives malicious traffic from one IP. Block it without NACLs or WAF.** → [Core: block IP](../core-answers.md#block-ip). Also the security group (it has no deny rules, so you'd have to narrow the allow rules, which is impractical for a public site), hence host firewall or NGINX `deny`.

## Kubernetes and troubleshooting

**9. A pod fails with OOMKilled.** → [Core](../core-answers.md#oomkilled)

**10. The app returns 5xx errors.** → [Core](../core-answers.md#http-5xx)

**11. The app has database-related issues: fix or optimise.** Find whether it's connectivity (DNS, security group, credentials, TLS), capacity (connections maxed, CPU or IOPS saturated) or queries. Use slow query logs and Performance Insights / `pg_stat_statements`, `EXPLAIN ANALYZE` on top queries, add indexes, fix N+1 patterns, connection pooling (PgBouncer, RDS Proxy), read replicas for read-heavy load, caching (Redis), right-size the instance and storage (gp3 or provisioned IOPS), tune parameters, and archive old data. → [Airbnb pool answer](airbnb.md)

**12. Kubernetes Service types: ClusterIP, NodePort and LoadBalancer.** → [Core](../core-answers.md#services-ingress)

**13. With a NodePort Service, if you point a Route 53 record at the instance's IP, will traffic reach the app?** **Only if** clients use the NodePort in the URL (DNS maps names to IPs, not ports: `http://app.example.com:31080`), the node's **security group allows that NodePort** from the clients, the node has a public IP (or clients are inside the network), and the record points at a node IP that stays stable (nodes get replaced, so a single-node A record is fragile). Port 80/443 without the port number won't work. Use a LoadBalancer Service or an Ingress with an alias record instead.

## Monitoring and upgrades

**14. How do you create a custom Node Exporter metric for Prometheus?** The simplest is the **textfile collector**: node_exporter runs with `--collector.textfile.directory=/var/lib/node_exporter`, and a cron or systemd timer script writes metrics atomically:

```bash
cat <<EOF > /var/lib/node_exporter/backup.prom.$$
# HELP backup_last_success_timestamp_seconds Last successful backup.
# TYPE backup_last_success_timestamp_seconds gauge
backup_last_success_timestamp_seconds $(date +%s)
EOF
mv /var/lib/node_exporter/backup.prom.$$ /var/lib/node_exporter/backup.prom
```

For richer needs, write a **custom exporter** with a Prometheus client library (Python `prometheus_client`, Go `client_golang`) exposing `/metrics`, and scrape it through a ServiceMonitor or `scrape_config`.

**15. Steps to upgrade EKS from 1.34 to 1.35 with zero downtime.** → [Core: cluster upgrade](../core-answers.md#cluster-upgrade)
