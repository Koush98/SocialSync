import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import app.db.models  # noqa: F401
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.middleware.jwt_context import jwt_context_middleware

configure_logging()
logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting %s", settings.PROJECT_NAME)
    yield
    logger.info("Shutting down application")


app = FastAPI(
    title=get_settings().PROJECT_NAME,
    description="Multi-platform Social Media Scheduler",
    version="1.0.1",  # Bumped version to trigger Railway deploy
    lifespan=lifespan,
    openapi_url=f"{get_settings().API_V1_STR}/openapi.json",
    swagger_ui_init_oauth={
        "clientId": get_settings().GOOGLE_CLIENT_ID,
        "clientSecret": get_settings().GOOGLE_SECRET,
        "scopes": "openid email profile",
        "appName": get_settings().PROJECT_NAME,
    },
    swagger_ui_oauth2_redirect_url="/docs/oauth2-redirect",
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.middleware("http")(jwt_context_middleware)




from app.api.v1.api import api_router
from fastapi.security import OAuth2PasswordBearer


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/oauth/token") # This should point to your token endpoint

app.include_router(api_router, prefix=get_settings().API_V1_STR)




@app.get("/")
async def root():
    return {
        "message": "Welcome to SocialSync API",
        "docs": "/docs"
    }


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """
    Generate and propagate correlation ID for end-to-end request tracing.
    
    Every request gets a unique request_id that flows through:
    - API layer
    - Celery tasks
    - External API calls
    """
    import uuid
    
    # Get request_id from header or generate new one
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    # Store in request state for access in endpoints
    request.state.request_id = request_id
    
    started = time.perf_counter()
    
    logger.info(
        "request.started",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
        }
    )
    
    try:
        response = await call_next(request)
        
        # Add request_id to response headers
        response.headers["X-Request-ID"] = request_id
        
        duration_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "request.completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
            }
        )
        
        return response
        
    except Exception as e:
        duration_ms = (time.perf_counter() - started) * 1000
        logger.exception(
            "request.failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": round(duration_ms, 2),
                "error": str(e),
            }
        )
        
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "request_id": request_id,  # User can report this for debugging
            },
        )
