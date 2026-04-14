# SocialSync - Quick Deployment Checklist

Use this checklist to track your deployment progress.

---

## ✅ Pre-Deployment

- [ ] Code pushed to GitHub (main/master branch)
- [ ] All CI/CD files committed:
  - [ ] `.github/workflows/deploy-backend.yml`
  - [ ] `.github/workflows/deploy-frontend.yml`
  - [ ] `railway.json`
  - [ ] `railway-worker.json`
  - [ ] `railway-beat.json`
  - [ ] `Dockerfile.railway`
  - [ ] `frontend/vercel.json`

---

## ✅ Railway Setup

- [ ] Railway account created
- [ ] New project created from GitHub repo
- [ ] PostgreSQL service added
- [ ] Redis service added
- [ ] Backend service configured with `railway.json`
- [ ] Worker service configured with `railway-worker.json`
- [ ] Beat service configured with `railway-beat.json`

---

## ✅ Environment Variables (Railway)

### Generate Security Keys
- [ ] ENCRYPTION_KEY generated
- [ ] JWT_SECRET generated

### Database & Redis
- [ ] DATABASE_URL copied from Railway PostgreSQL
- [ ] REDIS_URL copied from Railway Redis

### OAuth Credentials
- [ ] Facebook/Instagram app created & credentials added
- [ ] LinkedIn app created & credentials added
- [ ] Google/YouTube app created & credentials added
- [ ] Twitter/X app created & credentials added

### URLs
- [ ] BACKEND_PUBLIC_URL set (Railway backend URL)
- [ ] FRONTEND_URL set (Vercel frontend URL)
- [ ] ADDITIONAL_CORS_ORIGINS set (Vercel URL)

### Media Storage
- [ ] Cloudinary account setup
- [ ] CLOUDINARY_CLOUD_NAME added
- [ ] CLOUDINARY_API_KEY added
- [ ] CLOUDINARY_API_SECRET added

### Security Settings
- [ ] SESSION_COOKIE_SECURE=true
- [ ] SESSION_COOKIE_SAMESITE=none

---

## ✅ Vercel Setup

- [ ] Vercel account created
- [ ] Project imported from GitHub
- [ ] Root directory set to `frontend`
- [ ] Environment variables added:
  - [ ] NEXT_PUBLIC_API_BASE_URL
  - [ ] NEXT_PUBLIC_TENANT_ID
  - [ ] NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY

---

## ✅ OAuth Provider Configuration

- [ ] Facebook redirect URI updated: `https://your-backend.railway.app/api/v1/oauth/facebook/callback`
- [ ] Instagram redirect URI updated: `https://your-backend.railway.app/api/v1/oauth/instagram/callback`
- [ ] LinkedIn redirect URI updated: `https://your-backend.railway.app/api/v1/oauth/linkedin/callback`
- [ ] Google redirect URI updated: `https://your-backend.railway.app/api/v1/oauth/google/callback`
- [ ] Twitter redirect URI updated: `https://your-backend.railway.app/api/v1/oauth/twitter/callback`

---

## ✅ GitHub Secrets Configuration

- [ ] RAILWAY_API_TOKEN added
- [ ] RAILWAY_PROJECT_ID added
- [ ] VERCEL_TOKEN added
- [ ] VERCEL_ORG_ID added
- [ ] VERCEL_PROJECT_ID added

---

## ✅ Test Deployment

### Trigger Deployment
- [ ] Push to main/master branch
- [ ] GitHub Actions workflows triggered

### Monitor CI/CD
- [ ] Backend tests pass
- [ ] Backend deployment successful
- [ ] Worker deployment successful
- [ ] Beat deployment successful
- [ ] Frontend deployment successful

### Verify Deployment
- [ ] Backend health check passes: `curl https://your-backend.railway.app/api/v1/health`
- [ ] Frontend loads: `https://your-frontend.vercel.app`
- [ ] Database migrations ran successfully
- [ ] Redis connection working
- [ ] Can create a test post
- [ ] OAuth social login works (test one platform)

---

## ✅ Post-Deployment

- [ ] Monitor Railway logs for errors
- [ ] Monitor Vercel deployment logs
- [ ] Test all social platform connections
- [ ] Test post scheduling
- [ ] Test immediate publishing
- [ ] Verify Celery worker processes tasks
- [ ] Verify Celery beat schedules tasks
- [ ] Check database tables created
- [ ] Test media uploads (Cloudinary)

---

## 🎉 Deployment Complete!

Your SocialSync is now live with:
- ✅ Frontend on Vercel
- ✅ Backend API on Railway
- ✅ Celery Worker on Railway
- ✅ Celery Beat on Railway
- ✅ PostgreSQL on Railway
- ✅ Redis on Railway
- ✅ Automated CI/CD via GitHub Actions

---

## 📝 Notes

- Railway $5 credit will last ~1-2 months for testing
- Monitor usage in Railway dashboard
- Set up alerts for credit usage
- Consider upgrading Railway plan for production use

---

**Last Updated**: 2026-04-07
