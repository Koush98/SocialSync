from dataclasses import dataclass
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.auth import CurrentUser, decode_bearer_token
from app.core.config import get_settings


@dataclass
class RequestContext:
    tenant_id: str
    user_id: str
    role: str
    is_admin: bool
    token: Optional[str]
    current_user: CurrentUser


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None

    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        return None
    return parts[1]


def _extract_request_token(request: Request, settings) -> Optional[str]:
    header_token = _extract_bearer_token(request.headers.get("Authorization"))
    if header_token:
        return header_token
    cookie_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    return cookie_token or None


def _build_developer_user(request: Request, settings) -> CurrentUser:
    query_tenant_id = (
        request.query_params.get(settings.QUERY_TENANT_PARAM)
        or request.query_params.get("tenant_id")
    )
    header_tenant_id = request.headers.get("X-Tenant-ID")
    tenant_id = header_tenant_id or query_tenant_id or "tenant_123"
    return CurrentUser(
        subject="00000000-0000-0000-0000-000000000000",
        tenant_id=tenant_id,
        role="developer",
        is_admin=False,
        claims={
            settings.JWT_TENANT_CLAIM: tenant_id,
            settings.JWT_SUBJECT_CLAIM: "00000000-0000-0000-0000-000000000000",
            settings.JWT_ROLE_CLAIM: "false",
        },
    )


async def jwt_context_middleware(request: Request, call_next):
    """JWT authentication middleware with CORS support for error responses."""
    oauth_path = request.url.path.startswith("/api/v1/oauth/")
    oauth_callback_path = oauth_path and request.url.path.endswith("/callback")
    auth_exchange_path = request.url.path == "/api/v1/auth/webview/exchange"
    public_auth_paths = {
        "/api/v1/auth/session",
        "/api/v1/auth/logout",
    }

    public_paths = [
        "/docs",
        "/openapi.json",
        "/redoc",
        "/docs/oauth2-redirect",
        "/api/v1/openapi.json",
    ]
    if any(request.url.path.startswith(p) for p in public_paths):
        return await call_next(request)

    if request.url.path in public_auth_paths:
        return await call_next(request)

    if oauth_callback_path or auth_exchange_path:
        return await call_next(request)
    
    if request.method == "OPTIONS":
        return await call_next(request)

    settings = get_settings()
    token = _extract_request_token(request, settings)
    current_user: Optional[CurrentUser] = None

    if token:
        try:
            current_user = decode_bearer_token(token)
        except Exception as exc:
            detail = getattr(exc, "detail", "Invalid bearer token")
            status_code = getattr(exc, "status_code", 401)
            response = JSONResponse(status_code=status_code, content={"detail": detail})
            # Add CORS headers to error response
            origin = request.headers.get("origin")
            if origin:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
            return response
    elif oauth_path and settings.ALLOW_PUBLIC_OAUTH_LOGIN:
        current_user = _build_developer_user(request, settings)
    elif settings.AUTH_REQUIRED and not settings.ALLOW_DEV_TENANT_HEADER:
        response = JSONResponse(status_code=401, content={"detail": "Bearer token is required"})
        # Add CORS headers to error response
        origin = request.headers.get("origin")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    if current_user is None and settings.ALLOW_DEV_TENANT_HEADER:
        current_user = _build_developer_user(request, settings)
    elif current_user is None:
        response = JSONResponse(status_code=401, content={"detail": "Tenant context is missing"})
        # Add CORS headers to error response
        origin = request.headers.get("origin")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    request.state.current_user = current_user
    request.state.request_context = RequestContext(
        tenant_id=current_user.tenant_id,
        user_id=current_user.subject,
        role=current_user.role or "user",
        is_admin=current_user.is_admin,
        token=token,
        current_user=current_user,
    )

    return await call_next(request)
