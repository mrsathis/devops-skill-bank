---
tags:
  - interview
  - docker
---

# Docker and container questions (company not named)

**What is Docker and how does it work? What happens during `docker run`? Which Linux features does Docker use?** → [Core: docker run](../core-answers.md#docker-run)

**Containers vs virtual machines.** → [HashedIn](../companies/hashedin-deloitte.md)

**Dockerfile vs image vs container; what are custom images?** A **Dockerfile** is the build recipe. An **image** is the immutable build output. A **container** is a running instance. A **custom image** is one you build yourself (`FROM` a base plus your app and config), usually pushed to a private registry. → [Core](../core-answers.md#image-vs-container)

**A container is running but the app isn't reachable from the browser.** Check `docker ps` for the port mapping (`0.0.0.0:8080->80/tcp`). Is the app listening on **0.0.0.0**, not 127.0.0.1, inside the container (`docker exec … ss -ltn` or `netstat`)? Are you using the right host port? Is there a host firewall or cloud security group? Does `curl localhost:8080` work on the host? Is the container on a network you can reach?

**CMD vs ENTRYPOINT (vs RUN).** → [Core](../core-answers.md#cmd-entrypoint)

**COPY vs ADD; a real example.** → [Core](../core-answers.md#copy-vs-add)

**Reduce a 2 GB / 450 MB image; optimise a Dockerfile.** → [Core](../core-answers.md#image-size)

**Multi-stage builds; a multi-stage Dockerfile for a Maven app.** → [Core](../core-answers.md#multi-stage)

**A container stops immediately after starting / keeps restarting; what happens when PID 1 stops?** → [Core](../core-answers.md#container-restarts). When PID 1 exits, the container stops. All other processes in it are killed.

**What happens to container data when the container is deleted? Volumes vs bind mounts?** → [Core](../core-answers.md#docker-storage)

**Two containers need to talk; custom bridge vs default bridge; `EXPOSE 80` vs `-p 8080:80`; the app container can't reach MySQL.** → [Core](../core-answers.md#docker-networking)

**`docker stop` vs `docker kill` vs `docker rm`.** `stop` sends **SIGTERM**, waits (10 s by default, `-t`), then SIGKILL, so the app can shut down gracefully. `kill` sends **SIGKILL** straight away (or another signal with `-s`). `rm` **removes** a stopped container and its writable layer (`-f` kills and removes, `-v` also removes anonymous volumes).

**A container is using very high CPU or memory: investigate and limit it.** `docker stats` for live usage, `docker top <c>` or `docker exec … top` for the process, then profile the app. Limit with `docker run --cpus=1.5 --memory=512m --memory-swap=512m --pids-limit=200` (Compose: `deploy.resources.limits`). Over the memory limit, the process is OOM-killed (exit 137).

**Why is running containers as root risky?** Root in the container is UID 0 on the host kernel (unless you use user namespaces). If someone breaks out of the container (a kernel or runtime CVE, a privileged flag, a mounted Docker socket or host paths), they're root on the host. Root also makes in-container privilege abuse easier (modifying binaries, binding low ports, reading mounted secrets). Mitigate with `USER` non-root in the Dockerfile, `--read-only`, `--cap-drop=ALL`, no `--privileged`, rootless Docker or user-namespace remapping, and seccomp and AppArmor profiles.

**How do you pass passwords and API keys to containers securely? Credentials for a PHP app connecting to MySQL?** → [Core](../core-answers.md#container-secrets). For PHP: read from env vars or a mounted secret file (`DB_PASSWORD_FILE=/run/secrets/db_password`) injected by the orchestrator from Secrets Manager or Vault, never baked into `config.php` in the image.

**Image layers vs the container's writable layer.** → [Core](../core-answers.md#image-vs-container)

**The image works on your laptop but fails in CI or production.** Differences: **CPU architecture** (an arm64 Mac building arm64 images for amd64 servers, so use `docker buildx --platform linux/amd64`), env vars and secrets, mounted files only present locally, network or DNS access (corporate proxy, private registries), a different base image tag pulled (`latest` drift, so pin digests), resource limits in production, running as non-root in production, and a read-only filesystem. Reproduce with the exact image digest and production-like run flags.

**Design a Docker Compose setup for a Flask + MySQL app (services, networking, env vars, volumes, health checks, dependencies).**

```yaml
services:
  db:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: app
      MYSQL_USER: app
      MYSQL_PASSWORD_FILE: /run/secrets/db_password
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/db_root_password
    secrets: [db_password, db_root_password]
    volumes: [db-data:/var/lib/mysql]
    networks: [backend]
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build: .
    environment:
      DB_HOST: db                     # service name = DNS name on the network
      DB_NAME: app
      DB_USER: app
      DB_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    ports: ["8000:8000"]
    depends_on:
      db: { condition: service_healthy }
    networks: [backend]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/health"]
      interval: 15s
    restart: unless-stopped

networks: { backend: {} }
volumes:  { db-data: {} }
secrets:
  db_password:      { file: ./secrets/db_password.txt }
  db_root_password: { file: ./secrets/db_root_password.txt }
```

**Dockerfile vs Docker Compose.** A Dockerfile builds **one image**. Compose (`compose.yaml`) defines and runs a **multi-container application**: services, networks, volumes, env vars and dependencies, started with `docker compose up`. **Targets in Compose**: `build.target` selects a stage in a multi-stage Dockerfile (for example `target: dev` for local work, `prod` for production).

**Write a Dockerfile for a Node.js project; why copy `package.json` first? `package.json` vs `package-lock.json`.**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Copying the manifests first means the **`npm ci` layer is cached** and only rebuilt when dependencies change, not on every source edit. `package.json` declares dependency **ranges** and scripts. `package-lock.json` records the **exact resolved versions** of the whole tree, so `npm ci` installs reproducibly. Commit both.

**Write a Dockerfile for an NGINX image.**

```dockerfile
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
# base image already runs: nginx -g 'daemon off;'
```

**Command to list running containers / all containers / view container logs.** `docker ps`, `docker ps -a`, `docker logs -f --tail 100 <container>`.

**Common reasons a container restarts continuously.** → [Core](../core-answers.md#container-restarts)

**Docker layers and debug factors.** → [Paytm](../companies/paytm.md)

**How do you build and deploy an application with Docker?** Write a Dockerfile → `docker build -t registry/app:<sha> .` → test → `docker push` → deploy by pulling that tag on the target (Compose, ECS, Kubernetes) → health check → roll back by redeploying the previous tag.

**Do you use Docker Swarm?** Be honest. Most teams use Kubernetes or ECS today. Swarm is simple (`docker swarm init`, services, overlay networks, built-in secrets) but has a small ecosystem. → [Kubernetes vs Swarm](kubernetes.md)

**Push images to ECR.** → [Topic: AWS](aws-cloud.md#ecr-push)
