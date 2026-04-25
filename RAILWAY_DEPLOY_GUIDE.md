# Railway Manual Deployment Guide

## If Auto-Deploy is Not Working

### Quick Fix: Manual Deploy from Dashboard

1. **Go to Railway**: https://railway.app
2. **Select your project**: `zippy-mindfulness-production`
3. **Click on your service**
4. **Click "Deployments" tab**
5. **Click "New Deployment"** (top right corner)
6. **Select "Deploy from GitHub"**
7. **Choose latest commit**: `a6ccf8b - Bump version to 1.0.1`
8. **Click "Deploy"**

### Alternative: Redeploy Existing Deployment

1. In Railway, go to your service
2. Click **"Deployments"** tab
3. Find any previous deployment
4. Click the **⋮ (three dots)** menu on the right
5. Click **"Redeploy"**

### Fix Auto-Deploy Settings

1. Go to your service in Railway
2. Click **"Settings"** tab
3. Scroll to **"Deploy Triggers"** section
4. Make sure:
   - ✅ **Auto Deploy** is toggled ON
   - **Branch** is set to `master`
   - **Trigger** is set to "Push"

### Check GitHub Connection

1. In Railway service Settings
2. Look for **"Connected Repository"**
3. Should show: `Koush98/SocialSync`
4. If not connected:
   - Click **"Connect Repo"**
   - Select `SocialSync` from your GitHub repos
   - Set branch to `master`

## After Deployment Starts

1. **Watch the deployment logs** in Railway
2. **Wait 2-5 minutes** for build and deploy
3. **Look for green checkmark** = successful deployment
4. **If red X** = deployment failed, check logs for errors

## Verify Deployment

After successful deployment, test CORS:

```bash
python test_cors.py
```

Expected output for test 3:
```
3. Testing accounts endpoint (requires authentication)...
   Status Code: 401
   Access-Control-Allow-Origin: https://social-sync-alpha.vercel.app
   ⚠️  401 Unauthorized (expected - token is invalid)
   ✅ But CORS is working!
```

## Common Issues

### Deployment Not Starting
- Check GitHub webhook is configured
- Try manual deploy from dashboard
- Reconnect GitHub repository in Railway settings

### Deployment Fails
- Check deployment logs in Railway
- Common causes:
  - Missing environment variables
  - Database connection issues
  - Build errors (check Python dependencies)

### Deployment Succeeds but CORS Still Broken
- Railway might be using cached version
- Wait 2-3 minutes for CDN cache to clear
- Try hard refresh in browser (Ctrl+Shift+R)
- Test in incognito/private browser window

## Emergency: Local Test

If Railway is having issues, you can test locally:

```bash
# Start backend locally
docker compose up -d

# Update frontend .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Run frontend
cd frontend
npm run dev
```
