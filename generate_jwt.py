# generate_jwt.py
import jwt
import time
from app.core.config import get_settings

settings = get_settings()

secret_key = settings.JWT_SECRET   # MUST match backend
algorithm = settings.JWT_ALGORITHM or "HS256"

payload = {
    "TenantId": "tenant_123",
    "UserId": "demo-user-001",
    "ISAdmin": True,
    "exp": int(time.time()) + (3600 * 24),   # 24 hours
    "iat": int(time.time()),
}

# Add issuer if configured
if settings.JWT_ISSUER:
    payload["iss"] = settings.JWT_ISSUER

# Add audience if configured
if settings.JWT_AUDIENCE:
    payload["aud"] = settings.JWT_AUDIENCE

token = jwt.encode(payload, secret_key, algorithm=algorithm)

print("\n" + "="*70)
print("✅ YOUR NEW JWT TOKEN")
print("="*70)
print(token)
print("\nCopy the entire line above and use it.")
print("="*70)