# SocialSync AWS Production Deployment Guide

This guide gives you a one-time scalable AWS setup for SocialSync that can handle early traffic spikes without re-architecting in week one.

## What We Will Use

For your stack (`FastAPI + Celery worker + Celery beat + Redis + PostgreSQL + Next.js`), use:

1. Compute: **Amazon ECS on Fargate**
2. API traffic: **Application Load Balancer (ALB)**
3. Database: **Amazon Aurora PostgreSQL (Multi-AZ)**
4. DB connection pooling: **RDS Proxy**
5. Queue/cache: **ElastiCache for Redis (Multi-AZ)**
6. Secrets: **AWS Secrets Manager**
7. Logs/metrics: **CloudWatch**
8. DNS/TLS: **Route 53 + ACM**
9. Security edge: **AWS WAF** (recommended for production)

This is the recommended one-time scalable solution for your use case.

## Architecture

You will run 3 ECS services from the same backend image:

1. `api` service (FastAPI)
2. `worker` service (Celery worker)
3. `beat` service (Celery beat, exactly 1 running task)

Flow:

1. User -> ALB -> ECS `api`
2. `api` writes post data to Aurora
3. `api` enqueues job in Redis
4. ECS `worker` consumes and publishes
5. ECS `beat` triggers scheduled jobs

## Why This Over Low-Cost Starter

Low-cost starter setups (single-AZ DB, single Redis node, non-scaled workers) are fine for testing, but risky for an already-running CRM with spike risk.

This setup avoids:

1. silent queue bottlenecks
2. DB connection storms
3. single-node failures
4. urgent rework after launch

## Beginner-Friendly Build Plan

## Phase 1: AWS Foundation (one time)

1. Create one VPC with 3 public and 3 private subnets across 3 AZs.
2. Put ALB in public subnets.
3. Put ECS tasks, Aurora, Redis in private subnets.
4. Create security groups:
   - `alb-sg`: inbound 80/443 from internet
   - `api-sg`: inbound app port from `alb-sg`
   - `db-sg`: inbound 5432 from `api-sg` and `worker-sg`
   - `redis-sg`: inbound 6379 from `api-sg`, `worker-sg`, `beat-sg`
   - `worker-sg` and `beat-sg`: no public inbound

## Phase 2: Data Layer

1. Create **Aurora PostgreSQL** cluster (Multi-AZ).
2. Create **RDS Proxy** in same VPC, target the Aurora cluster.
3. Store DB credentials in **Secrets Manager**.
4. Create **ElastiCache Redis** replication group (Multi-AZ, automatic failover enabled).

## Phase 3: Container & Services

1. Push backend Docker image to ECR.
2. Create ECS cluster (Fargate).
3. Create 3 task definitions:
   - `api-task`: starts API command
   - `worker-task`: starts Celery worker
   - `beat-task`: starts Celery beat
4. Create ECS services:
   - `api`: desired count 3, attach to ALB target group
   - `worker`: desired count 2
   - `beat`: desired count 1

## Phase 4: Environment Variables

Set these in ECS task definitions (or SSM/Secrets Manager references):

1. `DATABASE_URL` -> use RDS Proxy endpoint
2. `REDIS_URL` -> ElastiCache primary endpoint
3. `BACKEND_PUBLIC_URL` -> your API domain
4. `FRONTEND_URL` -> your frontend domain
5. `ADDITIONAL_CORS_ORIGINS` -> frontend URL(s)
6. OAuth and JWT secrets
7. `SERVICE_ROLE`:
   - API service: `backend`
   - Worker service: `worker`
   - Beat service: `beat`

## Phase 5: Autoscaling

Configure ECS Service Auto Scaling:

1. API service:
   - min 3, max 20
   - scale by CPU + memory + ALB request count per target
2. Worker service:
   - min 2, max 30
   - scale by CPU + memory and queue lag metric (custom CloudWatch metric)
3. Beat service:
   - min 1, max 1 (do not autoscale)

## Phase 6: Observability

1. Send API/worker/beat logs to CloudWatch Log Groups.
2. Create alarms:
   - ALB 5xx high
   - ECS task restart spikes
   - workers online = 0
   - DB CPU high
   - Redis memory pressure
3. Add a dashboard for API latency, error rate, queue depth, worker count.

## Deployment (Beginner Path)

Use GitHub Actions with one workflow:

1. Build and push backend image to ECR.
2. Deploy `api` service.
3. Deploy `worker` service.
4. Deploy `beat` service.
5. Run health checks:
   - `/api/v1/health`
   - `/api/v1/ready`
   - `/api/v1/queue`

For frontend:

1. Keep frontend on Vercel or move later to CloudFront + S3.
2. Ensure frontend uses production API URL.

## Production Validation Checklist

Before delivery, verify:

1. `/api/v1/queue` shows `workers_online > 0`
2. Immediate post goes `queued -> processing -> posted`
3. Scheduled post triggers on time
4. Worker restart does not lose queue processing
5. API can scale out under load
6. No OAuth redirect domain mismatches

## Scalability Notes for 5000 Concurrent Users

1. Use RDS Proxy from day one to protect Aurora from connection spikes.
2. Keep API stateless so ECS can scale horizontally.
3. Scale worker count independently from API count.
4. Keep beat as singleton service.
5. Do load testing before public launch window.

## Cost Control Without Redesign

If traffic is lower than expected:

1. reduce API min tasks from 3 to 2
2. reduce worker min tasks from 2 to 1
3. right-size Aurora and Redis classes

This lowers cost without architecture changes.

## Common Mistakes to Avoid

1. Running beat with more than 1 replica.
2. Pointing `DATABASE_URL` directly to DB instead of RDS Proxy.
3. Exposing DB/Redis in public subnets.
4. Deploying API only but forgetting worker service.
5. No queue health endpoint monitoring.

## Quick Answers

1. Can we start cheaper?
Yes, but for your existing user base and spike risk, this production architecture is safer.

2. Can we migrate later to SQS?
Yes. Keep Redis now for minimal code change, move broker later if needed.

3. Is this beginner-friendly?
Yes. Build in phases above, service by service, then validate with the checklist.

