# SocialSync - Local Development Setup Guide

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ installed
- npm or yarn package manager

---

## 📦 Step 1: Start Backend Services

Open **Terminal 1** and run:

```bash
# Start all backend services (API, Worker, Beat, Flower, Redis, Postgres)
docker-compose up -d

# Check if all services are running
docker-compose ps
```

**Expected Output:**
```
NAME                    STATUS              PORTS
socialsync_backend      Up                  0.0.0.0:8000->8000/tcp
socialsync_worker       Up                  
socialsync_beat         Up                  
socialsync_flower       Up                  0.0.0.0:5555->5555/tcp
socialsync_redis        Up                  0.0.0.0:6379->6379/tcp
socialsync_redis_ui     Up                  0.0.0.0:8081->8081/tcp
socialsync_db           Up (healthy)        0.0.0.0:5433->5432/tcp
```

**Backend URLs:**
- API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs
- Flower (Celery Monitor): http://localhost:5555
- Redis UI: http://localhost:8081

---

## 💻 Step 2: Start Frontend

Open **Terminal 2** and run:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies (first time only)
npm install

# Copy environment variables (first time only)
cp .env.example .env.local

# Start development server
npm run dev
```

**Expected Output:**
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

**Frontend URL:**
- App: http://localhost:3000

---

## 🎯 Development Workflow

### Running Locally

**Terminal 1 - Backend:**
```bash
docker-compose up
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### Stopping Services

**Stop backend:**
```bash
docker-compose down
```

**Stop frontend:**
Press `Ctrl+C` in the frontend terminal

### Restarting Services

**Restart backend:**
```bash
docker-compose restart
```

**Restart frontend:**
Press `Ctrl+C`, then run `npm run dev` again

---

## 🔧 Environment Configuration

### Frontend Environment Variables

File: `frontend/.env.local`

```env
# Backend API URL (change for production)
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000

# Tenant ID for multi-tenant support
NEXT_PUBLIC_TENANT_ID=tenant_123

# JWT token storage key
NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY=socialsync_jwt
```

### Backend Environment Variables

File: `.env` (in root directory)

Copy from `.env.example` and update with your credentials:
```bash
cp .env.example .env
```

---

## 🌐 Deployment

### Deploy Frontend to Vercel

1. **Push code to GitHub**

2. **Connect to Vercel:**
   - Go to https://vercel.com
   - Click "New Project"
   - Import your repository
   - Set root directory to `frontend`

3. **Set Environment Variables:**
   ```
   NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.com
   NEXT_PUBLIC_TENANT_ID=your_tenant_id
   NEXT_PUBLIC_AUTH_TOKEN_STORAGE_KEY=socialsync_jwt
   ```

4. **Deploy**

### Deploy Backend

Backend can be deployed to any platform that supports Docker:
- AWS ECS
- Google Cloud Run
- Heroku
- DigitalOcean App Platform
- Railway

---

## 🐛 Troubleshooting

### Frontend can't connect to backend

1. **Check backend is running:**
   ```bash
   curl http://127.0.0.1:8000/
   # Should return: {"message": "Welcome to SocialSync API"}
   ```

2. **Verify environment variables:**
   ```bash
   cat frontend/.env.local
   # Should show: NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
   ```

3. **Restart frontend:**
   ```bash
   # Stop frontend (Ctrl+C)
   npm run dev
   ```

### CORS errors in browser console

Backend CORS is already configured to allow:
- http://localhost:3000
- http://127.0.0.1:3000

If you're using a different frontend URL, add it to `ADDITIONAL_CORS_ORIGINS` in backend `.env`:
```env
ADDITIONAL_CORS_ORIGINS=http://your-custom-url.com
```

### Database connection errors

```bash
# Check database is healthy
docker-compose ps db

# Restart database
docker-compose restart db

# Run migrations
docker-compose exec backend uv run alembic upgrade head
```

### Clear caches

**Frontend:**
```bash
cd frontend
rm -rf .next
npm run dev
```

**Backend:**
```bash
docker-compose down -v  # Warning: removes all data
docker-compose up -d
```

---

## 📊 Service Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend (Next.js) | 3000 | http://localhost:3000 |
| Backend API | 8000 | http://localhost:8000 |
| API Documentation | 8000 | http://localhost:8000/docs |
| Flower (Celery) | 5555 | http://localhost:5555 |
| Redis | 6379 | localhost:6379 |
| Redis UI | 8081 | http://localhost:8081 |
| PostgreSQL | 5433 | localhost:5433 |

---

## 📝 Common Commands

### Backend Commands

```bash
# View logs
docker-compose logs -f backend

# View worker logs
docker-compose logs -f worker

# Run database migrations
docker-compose exec backend uv run alembic upgrade head

# Access database
docker-compose exec db psql -U postgres -d socialsync

# Access Redis
docker-compose exec redis redis-cli
```

### Frontend Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linter
npm run lint
```

---

## 🎓 Next Steps

1. **Explore API Documentation:** http://localhost:8000/docs
2. **Monitor Tasks:** http://localhost:5555 (Flower)
3. **Browse Redis:** http://localhost:8081 (Redis UI)
4. **Start Building:** http://localhost:3000 (Frontend)

---

## 📚 Additional Resources

- [Frontend README](frontend/README.md)
- [API Documentation](http://localhost:8000/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

---

## 🆘 Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify all services are running: `docker-compose ps`
3. Review environment variables
4. Check the troubleshooting section above
