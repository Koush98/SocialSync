# SocialSync - Production Deployment Guide

Complete CI/CD deployment setup for **Vercel (Frontend)** + **Railway (Backend + Workers + Database)**

---

## 📋 Overview

This guide will help you deploy SocialSync to production with:

- ✅ **Frontend**: Vercel (auto-deploy from GitHub)
- ✅ **Backend API**: Railway (auto-deploy from GitHub)
- ✅ **Celery Worker**: Railway (auto-deploy from GitHub)
- ✅ **Celery Beat**: Railway (auto-deploy from GitHub)
- ✅ **PostgreSQL**: Railway (managed database)
- ✅ **Redis**: Railway (managed Redis)
- ✅ **CI/CD**: GitHub Actions (automated testing & deployment)

---

## 🚀 Step-by-Step Deployment

### Step 1: Prepare Your GitHub Repository

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Setup CI/CD for production deployment"
   git push origin main
   ```

2. **Ensure your repository structure**:
   ```
   SocialSync/
   ├── .github/workflows/
   │   ├── deploy-backend.yml    ✅ Created
   │   └── deploy-frontend.yml   ✅ Created
   ├── railway.json              ✅ Created
   ├── railway-worker.json       ✅ Created
   ├── railway-beat.json         ✅ Created
   ├── Dockerfile.railway        ✅ Created
   ├── frontend/
   │   └── vercel.json           ✅ Created
   └── .env.production           ✅ Created
   ```

---

### Step 2: Setup Railway Project

#### 2.1 Create Railway Account
1. Go to [https://railway.app](https://railway.app)
2. Sign up with your GitHub account
3. You'll get **$5 free credit** to start

#### 2.2 Create New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your SocialSync repository
4. Railway will auto-detect your services

#### 2.3 Add PostgreSQL Database
1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will provision a PostgreSQL instance
4. Copy the `DATABASE_URL` from the service variables

#### 2.4 Add Redis
1. Click **"+ New"**
2. Select **"Database"** → **"Add Redis"**
3. Railway will provision a Redis instance
4. Copy the `REDIS_URL` from the service variables

#### 2.5 Configure Backend Service
1. Click on your backend service (auto-created from GitHub)
2. Go to **"Settings"** tab
3. Configure:
   - **Service Name**: `backend`
   - **Root Directory**: Leave blank (uses root)
   - **Dockerfile Path**: `Dockerfile.railway`
4. Go to **"Variables"** tab
5. Add all environment variables from `.env.production` (see Step 4)

#### 2.6 Configure Worker Service
1. Click **"+ New"** → **"Empty Service"**
2. Name it: `worker`
3. Go to **"Settings"** tab:
   - **Service Name**: `worker`
   - **Dockerfile Path**: `Dockerfile.railway`
4. Go to **"Variables"** tab:
   - Add same variables as backend
   - Or reference from backend service

#### 2.7 Configure Beat Service
1. Click **"+ New"** → **"Empty Service"**
2. Name it: `beat`
3. Go to **"Settings"** tab:
   - **Service Name**: `beat`
   - **Dockerfile Path**: `Dockerfile.railway`
4. Go to **"Variables"** tab:
   - Add same variables as backend

---

### Step 3: Setup Vercel Frontend

#### 3.1 Create Vercel Account
1. Go to [https://vercel.com](https://vercel.com)
2. Sign up with your GitHub account

#### 3.2 Import Project
1. Click **"Add New..."** → **"Project"**
2. Import your SocialSync repository
3. **Configure Project**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)

#### 3.3 Add Environment Variables
In Vercel project settings → **Environment Variables**, add:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend.railway.app
NEXT_PUBLIC_TENANT_ID=tenant_123
NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY=snapkey_jwt
```

> **Note**: Replace `https://your-backend.railway.app` with your actual Railway backend URL

#### 3.4 Deploy
1. Click **"Deploy"**
2. Vercel will build and deploy your frontend
3. You'll get a URL like: `https://socialsync.vercel.app`

---

### Step 4: Configure Environment Variables

#### 4.1 Generate Security Keys

**Generate ENCRYPTION_KEY**:
```bash
python -c "import base64; from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Generate JWT_SECRET**:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

#### 4.2 Railway Environment Variables

Add these to **ALL THREE** Railway services (backend, worker, beat):

```env
# Database & Redis (from Railway services)
DATABASE_URL=postgresql://postgres:password@your-db.railway.internal:5432/railway
REDIS_URL=redis://default:password@your-redis.railway.internal:6379

# Security
ENCRYPTION_KEY=Fernet_key_from_step_4.1
JWT_SECRET=random_string_from_step_4.1

# OAuth (get from developer platforms)
FACEBOOK_CLIENT_ID=your_facebook_app_id
FACEBOOK_SECRET=your_facebook_app_secret
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_SECRET=your_linkedin_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_SECRET=your_google_client_secret
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret

# Cloudinary (from cloudinary.com)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# URLs (update after deployment)
BACKEND_PUBLIC_URL=https://your-backend.railway.app
FRONTEND_URL=https://your-frontend.vercel.app
ADDITIONAL_CORS_ORIGINS=https://your-frontend.vercel.app

# Security (production)
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=none

# JWT
AUTH_REQUIRED=true
ALLOW_DEV_TENANT_HEADER=false
JWT_ALGORITHM=HS256
JWT_ISSUER=SocialSync
JWT_AUDIENCE=SocialSync

# Multi-tenancy
JWT_TENANT_CLAIM=TenantId
JWT_SUBJECT_CLAIM=UserId
JWT_ROLE_CLAIM=ISAdmin
QUERY_TENANT_PARAM=tenantId

# Other
API_V1_STR=/api/v1
WEBVIEW_AUTH_CODE_TTL_SECONDS=60
```

---

### Step 5: Setup OAuth Providers

#### 5.1 Facebook/Instagram
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add **Facebook Login** and **Instagram Basic Display** products
4. Set **Valid OAuth Redirect URIs**:
   ```
   https://your-backend.railway.app/api/v1/oauth/facebook/callback
   https://your-backend.railway.app/api/v1/oauth/instagram/callback
   ```

#### 5.2 LinkedIn
1. Go to [LinkedIn Developers](https://developer.linkedin.com/)
2. Create a new app
3. Add **Sign In with LinkedIn** product
4. Set **Authorized redirect URLs**:
   ```
   https://your-backend.railway.app/api/v1/oauth/linkedin/callback
   ```

#### 5.3 Google (YouTube)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Set **Authorized redirect URIs**:
   ```
   https://your-backend.railway.app/api/v1/oauth/google/callback
   ```

#### 5.4 Twitter (X)
1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new project/app
3. Set **Callback URL / Redirect URL**:
   ```
   https://your-backend.railway.app/api/v1/oauth/twitter/callback
   ```

---

### Step 6: Configure GitHub Secrets for CI/CD

#### 6.1 Get Railway API Token
1. Go to [Railway Settings](https://railway.app/account/tokens)
2. Click **"New Token"**
3. Copy the token

#### 6.2 Get Railway Project ID
1. Open your Railway project
2. Look at the URL: `https://railway.app/project/PROJECT_ID`
3. Copy the `PROJECT_ID`

#### 6.3 Get Vercel Tokens
1. Go to Vercel **Account Settings** → **Tokens**
2. Create a new token
3. Copy it

4. Get **Org ID** and **Project ID** from:
   - Vercel dashboard → Your project → **Settings** → **General**

#### 6.4 Add GitHub Secrets
1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add these **Repository secrets**:

```
RAILWAY_API_TOKEN=your_railway_token
RAILWAY_PROJECT_ID=your_railway_project_id

VERCEL_TOKEN=your_vercel_token
VERCEL_ORG_ID=your_vercel_org_id
VERCEL_PROJECT_ID=your_vercel_project_id
```

---

### Step 7: Test CI/CD Pipeline

#### 7.1 Trigger Backend Deployment
```bash
# Make a small change to backend
echo "# CI/CD Test" >> README.md
git add .
git commit -m "test: trigger CI/CD pipeline"
git push origin main
```

#### 7.2 Monitor Deployment
1. Go to GitHub repo → **Actions** tab
2. Watch the workflows run:
   - ✅ **Deploy Backend to Railway** (tests + deploys backend, worker, beat)
   - ✅ **Deploy Frontend to Vercel** (if frontend files changed)

#### 7.3 Verify Deployment
1. **Backend Health Check**:
   ```bash
   curl https://your-backend.railway.app/api/v1/health
   ```

2. **Frontend**:
   - Open `https://your-frontend.vercel.app`
   - Test login and API connections

---

## 🔧 CI/CD Workflow Details

### Backend Pipeline (`deploy-backend.yml`)

**Triggers**:
- Push to `main`/`master` branch
- Changes in backend files (`app/`, `alembic/`, etc.)
- Manual trigger from GitHub Actions

**Jobs**:
1. **test**: Runs pytest with PostgreSQL + Redis
2. **deploy-backend**: Deploys backend API to Railway
3. **deploy-worker**: Deploys Celery worker
4. **deploy-beat**: Deploys Celery beat scheduler
5. **notify**: Posts deployment summary

### Frontend Pipeline (`deploy-frontend.yml`)

**Triggers**:
- Push to `main`/`master` branch
- Changes in `frontend/` directory
- Manual trigger from GitHub Actions

**Jobs**:
1. **deploy**: Builds and deploys to Vercel

---

## 📊 Monitoring & Debugging

### Railway Dashboard
- **Logs**: View real-time logs for each service
- **Metrics**: Monitor CPU, memory, and request counts
- **Variables**: Manage environment variables

### Vercel Dashboard
- **Deployments**: View build logs and deployment history
- **Analytics**: Track visitor metrics
- **Functions**: Monitor serverless function performance

### GitHub Actions
- **Workflow runs**: Check CI/CD pipeline status
- **Logs**: Debug failed deployments

---

## 🔄 Updating Your Deployment

### Automatic (Recommended)
```bash
git add .
git commit -m "feat: your changes"
git push origin main
```
GitHub Actions will automatically:
- Run tests
- Deploy backend to Railway
- Deploy frontend to Vercel

### Manual Trigger
1. Go to GitHub repo → **Actions** tab
2. Select workflow → **Run workflow**
3. Choose branch → **Run workflow**

---

## 🚨 Troubleshooting

### Backend won't start
```bash
# Check Railway logs
railway logs --service backend

# Common issues:
# 1. DATABASE_URL not set correctly
# 2. REDIS_URL not set correctly
# 3. Missing OAuth credentials
```

### CORS errors
Ensure `ADDITIONAL_CORS_ORIGINS` includes your Vercel URL:
```env
ADDITIONAL_CORS_ORIGINS=https://your-frontend.vercel.app
```

### OAuth callback mismatch
Update redirect URIs in social platform dashboards to match:
```
https://your-backend.railway.app/api/v1/oauth/{platform}/callback
```

### Worker not processing tasks
```bash
# Check worker logs
railway logs --service worker

# Verify REDIS_URL is correct
# Check that worker can connect to Redis
```

### Frontend can't reach backend
1. Verify `NEXT_PUBLIC_API_BASE_URL` in Vercel env vars
2. Check CORS settings in backend
3. Ensure backend is healthy: `curl https://your-backend.railway.app/api/v1/health`

---

## 💰 Cost Breakdown

### Free Tier Limits

**Railway**:
- $5 free credit (one-time)
- Covers ~500-700 hours of usage
- After credit expires: ~$5-10/month for 3 services

**Vercel**:
- 100GB bandwidth/month (free)
- Unlimited deployments
- Serverless function limits apply

**Total estimated cost**: $0 initially, then ~$5-10/month after Railway credit runs out

---

## 🎯 Next Steps

1. ✅ Deploy to production
2. 📈 Monitor performance
3. 🔒 Set up SSL (automatic on Railway & Vercel)
4. 📧 Configure email notifications (optional)
5. 🔄 Set up database backups (Railway auto-backups)
6. 📊 Add analytics tracking

---

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)

---

## 🆘 Support

If you encounter issues:
1. Check the **Troubleshooting** section above
2. Review deployment logs in Railway/Vercel dashboards
3. Check GitHub Actions workflow logs
4. Open an issue in your GitHub repository

---

**Happy Deploying! 🚀**
