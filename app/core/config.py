from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import List, Optional

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Security
    ENCRYPTION_KEY: str

    # Public application URLs
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    ADDITIONAL_CORS_ORIGINS: str = ""

    # OAuth
    FACEBOOK_CLIENT_ID: str
    FACEBOOK_SECRET: str
    LINKEDIN_CLIENT_ID: str
    LINKEDIN_SECRET: str
    GOOGLE_CLIENT_ID: str
    GOOGLE_SECRET: str
    TWITTER_CLIENT_ID: str
    TWITTER_CLIENT_SECRET: str

    # Cloudinary (for media uploads)
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str

    # OAuth callback overrides
    FACEBOOK_REDIRECT_URI: Optional[str] = None
    INSTAGRAM_REDIRECT_URI: Optional[str] = None
    LINKEDIN_REDIRECT_URI: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None
    BLOGGER_REDIRECT_URI: Optional[str] = None
    GOOGLE_BUSINESS_REDIRECT_URI: Optional[str] = None
    TWITTER_REDIRECT_URI: Optional[str] = None

    # Application
    PROJECT_NAME: str = "SocialSync"
    API_V1_STR: str = "/api/v1"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    WEBVIEW_AUTH_CODE_TTL_SECONDS: int = 60
    SESSION_COOKIE_NAME: str = "snapkey_session"
    SESSION_COOKIE_SECURE: bool = False
    SESSION_COOKIE_SAMESITE: str = "lax"

    # Auth / JWT
    AUTH_REQUIRED: bool = True
    ALLOW_DEV_TENANT_HEADER: bool = True
    ALLOW_PUBLIC_OAUTH_LOGIN: bool = False
    JWT_ALGORITHM: str = "HS256"
    JWT_SECRET: Optional[str] = None
    JWT_PUBLIC_KEY: Optional[str] = None
    JWT_AUDIENCE: Optional[str] = None
    JWT_ISSUER: Optional[str] = None
    JWT_TENANT_CLAIM: str = "TenantId"
    JWT_SUBJECT_CLAIM: str = "UserId"
    JWT_ROLE_CLAIM: str = "ISAdmin"
    QUERY_TENANT_PARAM: str = "tenantId"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    @property
    def backend_public_url(self) -> str:
        return self.BACKEND_PUBLIC_URL.rstrip("/")

    @property
    def frontend_url(self) -> str:
        return self.FRONTEND_URL.rstrip("/")

    @property
    def facebook_redirect_uri(self) -> str:
        return self.FACEBOOK_REDIRECT_URI or (
            self.backend_public_url + self.API_V1_STR + "/oauth/facebook/callback"
        )

    @property
    def instagram_redirect_uri(self) -> str:
        return self.INSTAGRAM_REDIRECT_URI or (
            self.backend_public_url + self.API_V1_STR + "/oauth/instagram/callback"
        )

    @property
    def linkedin_redirect_uri(self) -> str:
        return self.LINKEDIN_REDIRECT_URI or (
            self.backend_public_url + self.API_V1_STR + "/oauth/linkedin/callback"
        )

    @property
    def google_redirect_uri(self) -> str:
        return self.GOOGLE_REDIRECT_URI or (
            self.backend_public_url + self.API_V1_STR + "/oauth/google/callback"
        )

    @property
    def blogger_redirect_uri(self) -> str:
        return self.BLOGGER_REDIRECT_URI or (
            self.backend_public_url + self.API_V1_STR + "/oauth/blogger/callback"
        )

    @property
    def google_business_redirect_uri(self) -> str:
        return self.GOOGLE_BUSINESS_REDIRECT_URI or (
            self.backend_public_url + self.API_V1_STR + "/oauth/google_business/callback"
        )

    @property
    def twitter_redirect_uri(self) -> str:
        return self.TWITTER_REDIRECT_URI or (
            self.backend_public_url + self.API_V1_STR + "/oauth/twitter/callback"
        )

    def cors_origins(self) -> List[str]:
        origins = [
            self.frontend_url,
            "http://localhost:3000",  # Next.js dev server
            "http://127.0.0.1:3000",  # Next.js dev server (alternative)
        ]
        extra_origins = [
            origin.strip()
            for origin in self.ADDITIONAL_CORS_ORIGINS.split(",")
            if origin.strip()
        ]
        return origins + extra_origins


@lru_cache()
def get_settings() -> Settings:
    return Settings()
