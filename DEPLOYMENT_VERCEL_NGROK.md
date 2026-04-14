# Vercel Frontend + ngrok Backend

Use this setup when you want the frontend deployed on Vercel while the FastAPI backend keeps running on your local machine.

## Auth model for `.NET` and Android WebView

Native apps should keep using the normal bearer-authenticated backend flow, but the WebView handoff should use the newer code-exchange path instead of putting the raw JWT in the URL.

Recommended flow:

1. Native app authenticates the user and gets a bearer token
2. Native app calls `POST /api/v1/auth/webview/create-code` with `Authorization: Bearer <jwt>`
3. Backend returns a short-lived URL like `/webview-auth?code=...`
4. Native app opens that URL in WebView
5. Frontend exchanges the one-time code and establishes the cookie session

Important:

- the user identity stays the same as before
- the direct JWT is just converted into a safer temporary handoff code for the browser layer
- native apps can still call protected backend APIs directly with bearer auth when needed

## What auto redeploys

- **Frontend:** auto redeploys on every GitHub push through Vercel
- **Backend:** does **not** auto redeploy through ngrok, because it still runs on your own machine

You must keep your local backend running whenever you want the Vercel frontend to work against it.

## 1. Start the backend locally

```powershell
cd D:\SocialSyncV1
docker compose up -d --build
```

## 2. Start ngrok for the backend

```powershell
ngrok http 8000
```

Copy the generated HTTPS URL, for example:

```text
https://your-backend.ngrok-free.app
```

## 3. Configure backend `.env`

Set these values in the root `.env`:

```env
BACKEND_PUBLIC_URL=https://your-backend.ngrok-free.app
FRONTEND_URL=https://your-frontend.vercel.app
ADDITIONAL_CORS_ORIGINS=https://your-frontend.vercel.app
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=none
```

If you are testing OAuth callbacks through the tunnel, also point the provider callbacks at the ngrok URL:

```env
FACEBOOK_REDIRECT_URI=https://your-backend.ngrok-free.app/api/v1/oauth/facebook/callback
INSTAGRAM_REDIRECT_URI=https://your-backend.ngrok-free.app/api/v1/oauth/instagram/callback
LINKEDIN_REDIRECT_URI=https://your-backend.ngrok-free.app/api/v1/oauth/linkedin/callback
GOOGLE_REDIRECT_URI=https://your-backend.ngrok-free.app/api/v1/oauth/google/callback
TWITTER_REDIRECT_URI=https://your-backend.ngrok-free.app/api/v1/oauth/twitter/callback
```

Restart the backend after updating `.env`:

```powershell
docker compose up -d --build backend
```

## 4. Configure Vercel frontend environment

Deploy the **`frontend`** directory to Vercel and add these environment variables:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend.ngrok-free.app
NEXT_PUBLIC_TENANT_ID=tenant_123
NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY=snapkey_jwt
NEXT_PUBLIC_DEBUG_BEARER_TOKEN=your_raw_jwt_if_needed
```

Notes:

- `NEXT_PUBLIC_DEBUG_BEARER_TOKEN` is only needed if you still want the temporary demo login on the hosted frontend.
- Use the raw JWT only. Do **not** prefix it with `Bearer `.

## 5. Vercel project setup

In Vercel:

1. Import the GitHub repository
2. Set **Root Directory** to `frontend`
3. Confirm framework is **Next.js**
4. Add the environment variables above
5. Deploy

After that, every push to GitHub will automatically redeploy the frontend.

## 6. OAuth provider dashboards

If you are testing social login from the Vercel frontend:

- use the ngrok backend URL in the provider callback settings
- keep `FRONTEND_URL` pointed at the Vercel site
- keep the backend running locally while ngrok is active

## 7. Practical testing checklist

1. Open the Vercel frontend URL
2. Log in using the demo login or your normal auth flow
3. Confirm API-backed pages load correctly
4. Test social connect
5. Test post creation and scheduling
6. If something fails, check:

```powershell
docker compose logs -f backend
docker compose logs -f worker
```

## 8. Important limitation

If your ngrok URL changes, update:

- root `.env` `BACKEND_PUBLIC_URL`
- any OAuth callback URLs
- Vercel `NEXT_PUBLIC_API_BASE_URL`

Then restart backend and redeploy the frontend.
