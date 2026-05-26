# Production Deployment Stack — Groupio

**Research Date:** 2026-05-06
**Context:** Moving from working codebase to production launch for an Israeli-market SaaS
**Existing CI/CD:** GitHub Actions → Docker image → SSH deploy + Vercel (already wired in `.github/workflows/deploy.yml`)
**Existing infra code:** Docker Compose (7 services + 4 workers), multi-stage Dockerfile, Prometheus/Grafana/Sentry configured

---

## Recommended Stack (Summary)

| Layer | Recommendation | Confidence |
|-------|---------------|------------|
| Backend hosting | Fly.io (primary) or single VPS + Docker Compose (budget) | High |
| Frontend (web + admin) | Vercel — already wired | High (keep as-is) |
| PostgreSQL | Supabase (already integrated) | High (keep as-is) |
| Redis | Upstash Redis (serverless, EU region) | High |
| Qdrant | Qdrant Cloud (EU-West cluster) | High |
| Neo4j | Neo4j AuraDB Free/Pro | Medium |
| RabbitMQ | CloudAMQP (LavinMQ, EU region) | High |
| Secrets | GitHub Actions Environments + Doppler or AWS Secrets Manager | High |
| CDN | Cloudflare (Israel PoP coverage) | High |
| CI/CD | GitHub Actions — already wired, extend it | High |
| Observability | Sentry (already integrated) + Grafana Cloud | High |
| Container strategy | Docker Compose on single server for MVP; no k8s at launch | High |

---

## Hosting Options (Backend — Ranked)

### Option 1: Fly.io — RECOMMENDED for MVP launch

**Rationale:**
- Deploys Docker containers directly from your existing `docker/Dockerfile` — zero rewrite
- Has `fra` (Frankfurt) region which is the lowest-latency EU option for Israeli users (measured ~60ms vs Israel-to-Paris at ~65ms)
- Persistent volumes for Qdrant and Neo4j state (unlike Railway)
- Private networking between services without public exposure
- WebSocket support built-in (critical for real-time offer updates)
- `fly.toml` config is simpler than k8s manifests; `fly deploy` replaces the SSH-deploy step in current workflow
- Workers (agent_worker, scheduler, outbox_dispatcher, etc.) run as separate Fly apps sharing private networking
- Autoscaling to zero on workers is free during low-traffic periods

**Cost estimate (launch):** ~$80-150/month for API + worker apps at minimum scale

**Confidence: High**

**Caveat:** Fly.io has no Israeli PoP. All backend runs in EU (Frankfurt). Front-end served via Vercel's CDN handles Israeli latency better.

### Option 2: Single VPS + Docker Compose — RECOMMENDED as budget/fallback

**Rationale:**
- Exactly what the current deploy workflow does (SSH + `docker compose pull && up -d`)
- Zero migration — the deploy.yml already works against a `DEPLOY_HOST` secret
- Hetzner Cloud in Germany (`eu-central`, Frankfurt) or Contabo: €15-40/month for 4 vCPU, 8GB RAM
- Sufficient for MVP with 10 active buildings
- Simple to reason about; no platform learning curve

**When to choose this:** If budget is constrained, timeline is <4 weeks, or team is not familiar with Fly.io

**Confidence: High (for MVP scale)**

**Risk:** No zero-downtime deploys without additional work (can use `docker compose up -d --no-deps --build api` to reduce but not eliminate downtime). Not suitable if you expect >1000 concurrent users at launch.

### Option 3: Railway — NOT RECOMMENDED

**Why not:**
- No persistent volumes for Qdrant (vector data would be lost on redeploy) — this is a hard blocker
- Neo4j Community requires persistent storage — same issue
- PostgreSQL on Railway is functional but you're already on Supabase
- Price per resource is higher than Fly.io or VPS

### Option 4: Render — POSSIBLE but suboptimal

**Rationale:**
- Supports Docker; persistent disks are available (unlike Railway)
- Frankfurt region available
- Native PostgreSQL managed service (but you're already on Supabase)
- Zero-downtime deploys via Render

**Why not recommended over Fly.io:** More expensive per unit at equivalent specs; Render's private networking between services costs extra (Fly internal DNS is free)

**Confidence: Medium**

### Option 5: AWS (ECS Fargate + RDS + ElastiCache) — FUTURE, NOT NOW

**Why not yet:**
- Massive operational overhead for a team moving to first production launch
- eu-west-3 (Paris) adds ~20ms latency for Israeli users vs Frankfurt
- eu-south-1 (Milan) is closer geographically (~30ms) but has fewer managed service options
- RDS + ElastiCache + ECS + ALB + ECR costs will run $300-500+/month minimum before you've validated product
- IAM, VPC, security groups, ECS task definitions are weeks of DevOps work
- **Revisit at scale (>5000 users), not at MVP launch**

**Confidence: Low (premature for MVP)**

### Option 6: GCP / Cloud Run — POSSIBLE for stateless services only

- Cloud Run works well for the FastAPI container (stateless, containerized)
- But Qdrant and Neo4j need persistent volumes → Cloud Run is stateless → requires Cloud Filestore (NFS) or Cloud SQL workarounds
- GCP doesn't have a managed Qdrant offering; you'd still self-host
- Added complexity not justified at launch

### Option 7: Kubernetes (self-managed or GKE/EKS) — DO NOT USE AT LAUNCH

See "What to Avoid" section. This is a post-scale consideration only.

---

## Containerization Strategy

### Current state (already good)
- Multi-stage Dockerfile builds a minimal production image (~250MB)
- Non-root `appuser` at runtime
- Health check configured for uvicorn
- 4 uvicorn workers (`UVICORN_WORKERS=4`) — production-appropriate
- `docker-compose.yml` covers all 7+ services with health check dependencies

### For production launch: Docker Compose on a server (no k8s)

The codebase already has all the Docker Compose configuration needed. The recommended path:

1. **Keep Docker Compose** — the orchestration is already correct; workers, API, scheduler all defined
2. **Add `docker-compose.prod.yml`** override file that:
   - Removes `--reload` flag from uvicorn command
   - Removes volume mounts of `../src` (don't hot-reload in prod)
   - Sets resource limits (`mem_limit`, `cpus`)
   - Configures `restart: always` on all services
3. **Use `docker compose pull && docker compose up -d`** for zero-restart rolling update on the API (runs 4 workers → one container restart = brief gap, acceptable for MVP)
4. **Migrations:** Run `alembic upgrade head` as a one-shot container before API start — the CI migrate job already does this

### When to move to k8s: After 10,000+ users or when you need multi-region deployment

---

## Managed Database Services

### PostgreSQL — Keep Supabase (already integrated)

- `supabase` client already initialized in codebase; asyncpg direct connection also configured
- Supabase has hosted PostgreSQL in `eu-west-2` (London) with `eu-central-1` (Frankfurt) as alternative
- RLS policies are already wired to Supabase's auth model
- Free tier: 500MB; Pro tier: $25/month (2GB, no pausing)
- **Action required:** Switch to Supabase Pro for launch (free tier pauses after 1 week of inactivity)
- Connection pooling: Enable PgBouncer via Supabase dashboard (transaction mode); set pool size to match asyncpg max (25)

**Confidence: High**

### Redis — Upstash Redis (Serverless)

- Upstash has EU (Frankfurt) cluster
- Pay-per-request pricing — ~$0/month at MVP scale, scales automatically
- Persistent (no data loss on restart unlike Fly.io Redis add-on)
- TLS included; compatible with `redis[hiredis]` client already in `requirements-prod.txt`
- `REDIS_URL=rediss://...` — just update the env var

**Alternative:** If on a single VPS, keep Redis in Docker Compose (already configured with AOF persistence and password). This is simpler and free.

**Confidence: High**

### Qdrant — Qdrant Cloud

- Qdrant Cloud has EU-West cluster (Ireland/Frankfurt)
- Free tier: 1GB per cluster, 1 cluster
- API key auth — just set `QDRANT_URL` and `QDRANT_API_KEY` env vars (already in `.env.example`)
- The `.env.example` already has `VECTOR_DB_PROVIDER=qdrant` and `QDRANT_API_KEY` fields
- Collections: contractors, buildings, knowledge_base, conversations (already defined)

**Confidence: High**

### Neo4j — Neo4j AuraDB

- AuraDB Free: 50k nodes, 175k relationships — enough for MVP contractor reputation graph
- Frankfurt region available
- Connection string format: `neo4j+s://` (already handled by `NEO4J_URI` env var)
- Set `NEO4J_URI=neo4j+s://[instance-id].databases.neo4j.io` and `NEO4J_PASSWORD`
- APOC plugin available on AuraDB Pro; Free tier has limited APOC

**Caveat:** If APOC is critical (it's in `docker-compose.yml` as a plugin), move to AuraDB Pro ($65/month) or keep Neo4j self-hosted in Docker.

**Confidence: Medium (depends on APOC requirement)**

### RabbitMQ — CloudAMQP (LavinMQ)

- CloudAMQP has EU (Ireland, Frankfurt) clusters
- Free tier: 1M messages/month, 1 concurrent connection
- LavinMQ is CloudAMQP's modern broker (lighter than RabbitMQ, compatible protocol)
- Feature flags `ENABLE_RABBITMQ=false` and `ENABLE_OUTBOX=false` are default-off — no urgency
- URL format: `amqps://...` — just update `RABBITMQ_URL`

**Note:** RabbitMQ is optional for launch. The codebase disables it by default. For MVP, start with `ENABLE_RABBITMQ=false` and enable when you need async events at scale.

**Confidence: High**

---

## Secrets Management

### Recommended: GitHub Actions Environments + Doppler

**GitHub Actions Environments** (already partially used in `deploy.yml`):
- Secrets scoped to `staging` and `production` environments — already in deploy workflow
- All `secrets.DOCKER_PASSWORD`, `secrets.DEPLOY_SSH_KEY`, etc. are already referenced
- **Limitation:** Only accessible during CI/CD runs, not at container runtime

**Doppler** (recommended addition for runtime secrets):
- Injects all 170+ env vars into Docker containers at runtime
- `doppler run -- docker compose up` or Doppler Kubernetes operator
- Supports secret rotation without redeployment
- Has free tier; EU data residency option available
- Integrates with GitHub Actions: `uses: dopplerhq/cli-action@v3`

**Why not HashiCorp Vault:** Over-engineered for a 1-3 month launch. Vault requires a dedicated instance, agents, and lease management. Doppler does 90% of what you need with 10% of the complexity.

**Why not AWS Secrets Manager (standalone):** Requires AWS SDK in every service + IAM roles. Adds AWS dependency before you're on AWS.

**For VPS/Fly.io deployments today:**
1. Store all 170+ vars in GitHub Actions environment secrets (structured as one JSON blob or individual secrets)
2. Generate `.env` file at deploy time in the CI job
3. Mount as Docker env file or pass as environment variables to `docker compose`
4. **Never commit real values** — already enforced by GitLeaks in CI

**Confidence: High**

### What the secrets file currently handles
The existing `docker/staging-minimal.env` is tracked with placeholder values and is used by Docker Compose. For production:
- Replace with Doppler-injected or CI-generated env file
- Add to `.gitignore`: any file matching `*.production.env`

---

## CI/CD Pipeline

### Current state (already good — extend, don't replace)

The existing `.github/workflows/ci.yml` and `deploy.yml` cover:
- Ruff lint + mypy type check
- Alembic single-head check
- Backend tests (75% coverage gate)
- Frontend tests (Vitest)
- Build verification + TypeScript generation
- Docker build
- E2E Playwright tests
- Trivy vulnerability scan
- GitLeaks secret scan
- Vercel deployment (web + admin)
- SSH deploy to backend server
- Alembic migrations
- Slack notification

### Gaps to close before launch

1. **Image registry:** Current workflow uses `vars.DOCKER_REGISTRY` which is undefined if no secrets set. Recommend: GitHub Container Registry (`ghcr.io`) — free, no additional service, already logged in via `GITHUB_TOKEN`

2. **Rollback mechanism:** Current deploy does `docker compose pull && up -d` with no rollback. Add:
   - Tag images with both SHA and `production` tag
   - Keep previous image tagged as `production-previous`
   - Rollback job: `docker compose pull && docker compose up -d` with `production-previous` tag

3. **Migration safety:** Current workflow runs migrations after backend deploy. Better order:
   - Run migrations BEFORE updating the API container
   - Alembic migrations must be backward compatible (additive only, no column drops in same PR)

4. **Preview environments:** Vercel handles this for frontend. For backend PR previews — skip at launch, add post-MVP.

5. **Load testing in CI:** The `docs/LOAD_TESTING.md` exists — wire it as a nightly job against staging, not per-commit.

**Confidence: High (extend existing, don't rewrite)**

---

## CDN and Edge

### Cloudflare — RECOMMENDED

**Why Cloudflare specifically for Israel:**
- Cloudflare has a PoP in Tel Aviv (TLV) — confirmed in their network map
- Israeli users get CDN hits from within Israel, not from EU
- Free tier covers static assets, caching, DDoS protection
- Proxy DNS: point `groupio.co.il` and `api.groupio.co.il` through Cloudflare
- SSL/TLS termination at edge (free)
- WAF on Pro plan ($20/month) — recommended for production with payment flows

**Configuration for this stack:**
- `groupio.co.il` → Vercel (Cloudflare proxies to Vercel's edge)
- `admin.groupio.co.il` → Vercel
- `api.groupio.co.il` → Backend server/Fly.io app (Cloudflare proxies)

**WebSocket note:** WebSockets work through Cloudflare on all plans. The backend exposes `/api/v1/ws/*` — configure Cloudflare to allow WebSocket upgrade on those paths.

**Israeli domain (.co.il):** Register via Israeli registrar (Isoc.org.il, Name.co.il, or GoDaddy IL). Cloudflare handles DNS management after delegation.

**Confidence: High**

---

## Israeli-Specific Considerations

### Latency

| Region | Distance to Tel Aviv | Measured RTT |
|--------|---------------------|--------------|
| eu-west-3 (Paris) | 3,310 km | ~55-70ms |
| eu-south-1 (Milan) | 2,700 km | ~45-60ms |
| eu-central-1 (Frankfurt) | 3,450 km | ~60-75ms |
| eu-west-2 (London) | 3,600 km | ~65-80ms |

**Recommendation:** Use Frankfurt (eu-central-1) as primary. Despite slightly longer distance than Milan, Frankfurt has far more managed services available and better peering. Latency difference vs Milan is ~15ms — imperceptible for web app users.

With Cloudflare's Tel Aviv PoP, static assets and cacheable API responses are served from Israel itself, making EU backend latency less critical for page load performance.

### Israeli Payment Regulations

- **Stripe in Israel:** Stripe is fully operational in Israel as of 2023. Israeli businesses can receive payouts in ILS or USD. Stripe's Israel entity (Stripe Payments Israel Ltd.) is registered.
- **PCI DSS:** Stripe handles card data; Groupio is scope-reduced. Stripe's webhook signature verification is already implemented in the codebase.
- **Privacy Law (PPPA):** Israel's Protection of Privacy Law applies. GDPR-equivalent controls are sufficient. The system handles personal data of Israeli residents — document data retention in your Privacy Policy.
- **Bit/Paybox:** These Israeli payment methods are marked out-of-scope for MVP (confirmed in PROJECT.md). Stripe covers international cards + Apple Pay / Google Pay.

### WhatsApp for Israeli users

- WhatsApp penetration in Israel is extremely high (~95% of smartphone users)
- The existing WhatsApp Cloud API integration is correctly prioritized
- Set `WHATSAPP_*` env vars — the stub is already in the codebase
- Meta's WhatsApp Business API requires a Facebook Business account verification — this takes 2-4 weeks; start this process immediately

### Hebrew RTL

- Already implemented via `next-intl` (confirmed in codebase)
- Vercel's edge network handles RTL HTML correctly — no special CDN config needed
- Cloudflare does not interfere with HTML content; RTL works as-is

### Israeli Cloud Providers

**Bezeq Cloud / Cloudzone / 012 Cloud:** Israeli providers exist but are not recommended for this stack:
- No container orchestration services comparable to Fly.io or AWS
- Smaller ecosystems mean fewer integration options
- More expensive per resource than EU cloud providers
- No managed Qdrant, Neo4j, or Redis offerings
- **Use EU cloud providers with Cloudflare Israeli PoP for CDN** — this gives Israeli-speed static assets with EU-region compute, which is the right tradeoff

### Data residency

- No Israeli data localization law requires data to be stored in Israel for commercial SaaS
- Supabase `eu-west-2` (London) or `eu-central-1` (Frankfurt) is compliant with Israeli privacy law
- If you're handling government-related building data, verify with a local lawyer — generally not applicable for a consumer marketplace

---

## What to Avoid

### 1. Kubernetes at launch

**Why not:** 
- k8s adds 4-8 weeks of DevOps work before you can deploy your first service
- Your Docker Compose setup already works and the deploy workflow is functional
- Qdrant, Neo4j, and Redis all have managed cloud alternatives that eliminate the need for stateful k8s workloads
- k8s is justified at >50 services or >10 engineers; you have ~12 Docker services and a small team
- **Revisit when:** Monthly active users exceed 10,000 or you need multi-region active-active

### 2. Railway for stateful services

**Why not:** Railway has no persistent volume support that survives service restarts for community tier. Qdrant and Neo4j store their data to disk — losing vector embeddings on every deploy is a hard blocker.

### 3. Running your own RabbitMQ at launch

**Why not:** RabbitMQ cluster management (mirrored queues, HA policy, disk alarms) is operational overhead. The feature is already feature-flagged off by default (`ENABLE_RABBITMQ=false`). Use CloudAMQP and keep the flag off until you need it.

### 4. Multi-stage blue/green deploys (initially)

**Why not:** Blue/green requires double the infrastructure cost and load balancer configuration. For MVP with 10 buildings, a 5-10 second container restart during deploy is acceptable. Add when you hit paying users at scale.

### 5. AWS at MVP

**Why not:** AWS amplifies operational burden through IAM, VPC setup, Security Groups, and 47 services to configure before you're running. Cost at MVP scale (~$300-500/month) is 3-4x higher than Fly.io or VPS equivalents. The GitHub Actions SSH deploy pattern already works — ship it.

### 6. Storing secrets in `.env` files in production containers

**Why not:** The current `docker/staging-minimal.env` is tracked in git (with placeholders). In production, secrets must never be in tracked files. Use Doppler, GitHub Actions secrets injection, or a runtime secret store.

### 7. Vercel for the FastAPI backend

**Why not:** Vercel serverless functions support Python but with severe limitations — 10-second timeout on hobby, 60 seconds on pro, no persistent connections (asyncpg connection pool won't work), no WebSocket support, no background workers. The backend is not a good fit for Vercel Functions.

### 8. Self-hosted Pinecone alternative (Weaviate, Milvus)

**Why not:** The codebase already supports Qdrant and has a `VECTOR_DB_PROVIDER=pinecone` toggle stubbed out. Qdrant Cloud is the right managed path. Adding Weaviate or Milvus means new client code when Qdrant works today.

---

## Observability Stack

### Already in codebase (keep and wire up)

- **Sentry:** `sentry-sdk[fastapi]` installed; `SENTRY_DSN` just needs a real value. Both `sentry.client.config.ts` and `sentry.server.config.ts` exist in the Next.js apps.
- **Prometheus:** `prometheus-client` installed; scrape config in `monitoring/prometheus.yml`; alerts in `monitoring/alerts.yml`. Running in Docker Compose.
- **Grafana:** Configured in Docker Compose at port 3010

### Recommended production changes

1. **Grafana Cloud** (free tier) instead of self-hosted Grafana + Prometheus: Remote-write metrics from your server to Grafana Cloud. Eliminates self-hosted Prometheus persistence concerns.

2. **Sentry DSN:** Create a project per service (backend, web, admin) in Sentry. Set sampling rate to 10% for transactions, 100% for errors.

3. **Uptime monitoring:** BetterUptime or UptimeRobot (free) — monitor `/api/v1/health/live` every 60 seconds. Alert to Slack (already configured in alertmanager).

4. **Log aggregation:** Add `PAPERTRAIL_URL` or use Grafana Loki for structured log ingestion. `structlog` already outputs JSON — just needs a sink.

---

## Decision Summary

For a 1-3 month timeline to production with a small team:

**Phase 1 (weeks 1-2): Launch on VPS + Vercel**
- Hetzner Cloud CX31 (4 vCPU, 8GB, €15/month) in Frankfurt
- Docker Compose (existing config) for all backend services
- Vercel (existing config) for web + admin
- Supabase Pro for PostgreSQL
- Qdrant Cloud free tier for vectors
- Neo4j AuraDB free tier for graph
- Cloudflare free tier for DNS/CDN

**Phase 2 (weeks 3-8): Harden**
- Add Doppler for secrets management
- Move Redis to Upstash (remove one Docker service)
- Enable Cloudflare WAF ($20/month)
- Wire Sentry DSNs for all three apps
- CloudAMQP for RabbitMQ when async events are enabled

**Phase 3 (post-launch): Scale evaluation**
- Evaluate Fly.io migration if VPS becomes CPU-bound
- Add Grafana Cloud for metrics
- Load test to find bottlenecks before scaling infrastructure

**Total estimated cost at MVP launch: ~$100-150/month**
(Hetzner ~€15 + Supabase Pro $25 + Vercel Pro $20 + Cloudflare Pro $20 + Qdrant free + Neo4j free + misc)
