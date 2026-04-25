# Deploy Frontend to Vercel - Complete Guide

## Prerequisites
- Vercel account (https://vercel.com)
- Your project pushed to GitHub/GitLab/Bitbucket
- Backend already deployed at: https://zippy-mindfulness-production.up.railway.app

---

## Step 1: Update Backend CORS Configuration

**IMPORTANT**: Before deploying, you need to update your backend's `.env` on Railway to allow your Vercel frontend URL.

Once you deploy to Vercel, you'll get a URL like: `https://your-project.vercel.app`

Add this URL to your backend's Railway environment variables:

```
FRONTEND_URL=https://your-project.vercel.app
ADDITIONAL_CORS_ORIGINS=https://your-project.vercel.app
```

You can update these in your Railway dashboard:
1. Go to your Railway project
2. Click on your service
3. Go to the "Variables" tab
4. Add/update the variables above

---

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Navigate to frontend directory**:
   ```bash
   cd e:\SocialSyncV1\frontend
   ```

3. **Login to Vercel**:
   ```bash
   vercel login
   ```

4. **Deploy**:
   ```bash
   vercel
   ```
   - First time: Follow the prompts to link your project
   - Accept defaults for most questions
   - When asked about environment variables, you'll add them in the next step

5. **Set Environment Variables in Vercel Dashboard**:
   After deployment, go to your Vercel project dashboard:
   - Project Settings → Environment Variables
   - Add the following variables:
   
   ```
   NEXT_PUBLIC_API_BASE_URL = https://zippy-mindfulness-production.up.railway.app
   NEXT_PUBLIC_TENANT_ID = tenant_123
   NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY = snapkey_jwt
   NEXT_PUBLIC_DEBUG_BEARER_TOKEN = [your JWT token from generate_jwt.py]
   ```

6. **Redeploy** after adding environment variables:
   ```bash
   vercel --prod
   ```

### Option B: Deploy via Vercel Dashboard (Easiest)

1. **Go to Vercel**: https://vercel.com/new

2. **Import your Git repository**:
   - Connect your GitHub/GitLab/Bitbucket account
   - Select your SocialSyncV1 repository

3. **Configure Project**:
   - **Framework Preset**: Next.js (should auto-detect)
   - **Root Directory**: `frontend` (IMPORTANT: Set this to the frontend folder)
   - **Build Command**: `next build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
   - **Install Command**: `npm install` (auto-detected)

4. **Add Environment Variables**:
   Click "Environment Variables" and add:
   
   ```
   Name: NEXT_PUBLIC_API_BASE_URL
   Value: https://zippy-mindfulness-production.up.railway.app
   
   Name: NEXT_PUBLIC_TENANT_ID
   Value: tenant_123
   
   Name: NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY
   Value: snapkey_jwt
   
   Name: NEXT_PUBLIC_DEBUG_BEARER_TOKEN
   Value: [your JWT token - run python generate_jwt.py to get one]
   ```

5. **Deploy**: Click "Deploy"

---

## Step 3: Verify Deployment

1. **Check the deployed URL** provided by Vercel (e.g., `https://your-project.vercel.app`)

2. **Test the connection**:
   - Open your browser to the Vercel URL
   - Try to log in or access the dashboard
   - Open browser DevTools (F12) → Console to check for any errors

3. **Check API calls**:
   - In DevTools → Network tab
   - Verify API calls are going to: `https://zippy-mindfulness-production.up.railway.app/api/v1/...`

---

## Step 4: Configure Custom Domain (Optional)

1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Domains"
3. Add your custom domain
4. Follow the DNS configuration instructions

---

## Step 5: Update OAuth Redirect URIs (If Using Social Login)

If you're using OAuth (Facebook, Google, LinkedIn, Twitter), update the redirect URIs in your backend's Railway environment variables:

```
FRONTEND_URL=https://your-project.vercel.app
```

And update the OAuth app settings on each platform (Facebook Developers, Google Cloud Console, etc.) to include your Vercel URL in authorized redirect URIs.

---

## Troubleshooting

### CORS Errors
If you see CORS errors in the browser console:
- Verify `FRONTEND_URL` is set correctly in Railway backend
- Verify `ADDITIONAL_CORS_ORIGINS` includes your Vercel URL
- Redeploy the backend after making changes

### API Calls Failing
- Check that `NEXT_PUBLIC_API_BASE_URL` is set correctly in Vercel
- Verify the backend URL is accessible: `https://zippy-mindfulness-production.up.railway.app/api/v1/health`
- Check Vercel function logs in the dashboard

### Environment Variables Not Working
- Vercel requires redeployment after adding/changing environment variables
- Run: `vercel --prod` to trigger a new production deployment
- Verify variables are set in Vercel dashboard → Settings → Environment Variables

### Build Fails
- Check that you set the Root Directory to `frontend` in Vercel
- Verify all dependencies are in `package.json`
- Check build logs in Vercel dashboard for specific errors

---

## Quick Commands Reference

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Pull environment variables locally
vercel env pull

# View deployment logs
vercel logs [deployment-url]
```

---

## Environment Variables Summary

### Vercel Frontend (`.env.local` and Vercel Dashboard):
- `NEXT_PUBLIC_API_BASE_URL`: https://zippy-mindfulness-production.up.railway.app
- `NEXT_PUBLIC_TENANT_ID`: tenant_123
- `NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY`: snapkey_jwt
- `NEXT_PUBLIC_DEBUG_BEARER_TOKEN`: [JWT token]

### Railway Backend (`.env` on Railway):
- `FRONTEND_URL`: https://your-project.vercel.app
- `ADDITIONAL_CORS_ORIGINS`: https://your-project.vercel.app

---

## Next Steps

1. ✅ Deploy frontend to Vercel
2. ✅ Update backend CORS settings
3. ✅ Test the integration
4. ✅ Configure custom domain (optional)
5. ✅ Set up automatic deployments on git push
6. ✅ Monitor logs and performance

---

**Need help?** Check Vercel docs: https://vercel.com/docs
