# SocialSync Frontend

Next.js-based frontend for the SocialSync social media scheduling platform.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Backend API running (FastAPI)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and update:
   ```env
   NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
   NEXT_PUBLIC_TENANT_ID=tenant_123
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   ```
   http://localhost:3000
   ```

## 📦 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## 🌐 Deployment

### Deploy to Vercel (Recommended)

1. **Push your code to GitHub**

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select the `frontend` directory as root

3. **Set Environment Variables in Vercel Dashboard:**
   ```
   NEXT_PUBLIC_API_BASE_URL=https://your-production-api.com
   NEXT_PUBLIC_TENANT_ID=your_tenant_id
   NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY=socialsync_jwt
   ```

4. **Deploy:**
   - Vercel will automatically detect Next.js
   - Build Command: `next build`
   - Output Directory: `.next`
   - Click "Deploy"

### Deploy to Other Platforms

**Netlify:**
```bash
npm run build
# Deploy .next folder
```

**Docker:**
```bash
docker build -t socialsync-frontend .
docker run -p 3000:3000 socialsync-frontend
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_TENANT_ID` | Multi-tenant identifier | `tenant_123` |
| `NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY` | JWT storage key | `socialsync_jwt` |

### API Integration

The frontend connects to the backend API using the configured `NEXT_PUBLIC_API_BASE_URL`.

**Local Development:**
```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

**Production:**
```env
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

## 🏗️ Project Structure

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── create-post/       # Create post page
│   ├── posts/             # Posts management
│   ├── analytics/         # Analytics dashboard
│   └── settings/          # Settings page
├── components/            # Reusable React components
├── lib/                   # Utilities and API client
│   ├── api.ts            # API client functions
│   └── types.ts          # TypeScript types
├── public/               # Static assets
├── .env.local            # Local environment variables
├── .env.example          # Example environment variables
├── next.config.ts        # Next.js configuration
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## 🔗 Backend Setup

The frontend requires the backend API to be running. Start the backend:

```bash
# In the root project directory
docker-compose up -d
```

Backend services:
- **API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **Flower (Celery):** http://localhost:5555

## 🐛 Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. Ensure backend CORS includes your frontend URL
2. Check `NEXT_PUBLIC_API_BASE_URL` matches your backend URL
3. Backend should allow: `http://localhost:3000`

### API Connection Issues

1. Verify backend is running: `curl http://127.0.0.1:8000/`
2. Check environment variables are set correctly
3. Restart the Next.js dev server after changing `.env.local`

### Build Errors

```bash
# Clear Next.js cache
rm -rf .next
npm run build
```

## 📝 Development Workflow

1. **Terminal 1 - Backend:**
   ```bash
   docker-compose up
   ```

2. **Terminal 2 - Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Open:** http://localhost:3000

## 🎨 Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **HTTP Client:** Fetch API
- **State Management:** React hooks

## 📄 License

This project is part of SocialSync.
