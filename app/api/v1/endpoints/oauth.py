import base64
import hashlib
import secrets
from typing import Optional
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Query, Request, status

import requests
from fastapi.responses import RedirectResponse
import json
import time
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis_client import redis_client
from app.services.oauth_service import save_social_account

from fastapi import Depends
from app.utils.deps import get_current_user



router = APIRouter()
settings = get_settings()
logger = get_logger("app.oauth")


# ── state helpers ───────────────────────────────────────────────────────


def _build_state(tenant_id: str, user_id: str):
    payload = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "nonce": secrets.token_urlsafe(16),
        "exp": int(time.time()) + 600  # 10 min expiry
    }

    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()

    # Store nonce in Redis (anti-replay). If Redis is unavailable, surface a
    # service-level error instead of a generic 500.
    try:
        redis_client.setex(f"oauth_state:{payload['nonce']}", 600, "1")
    except Exception:
        logger.exception("oauth.state_store_unavailable operation=setex")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OAuth is temporarily unavailable. Please try again in a moment.",
        )

    return encoded


def _validate_and_extract_state(state: str):
    try:
        decoded = json.loads(base64.urlsafe_b64decode(state.encode()).decode())

        tenant_id = decoded["tenant_id"]
        user_id = decoded["user_id"]
        nonce = decoded["nonce"]
        exp = decoded["exp"]

        # expiry check
        if time.time() > exp:
            raise HTTPException(status_code=400, detail="State expired")

        # Nonce check (anti-replay).
        try:
            nonce_exists = redis_client.get(f"oauth_state:{nonce}")
        except Exception:
            logger.exception("oauth.state_store_unavailable operation=get")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OAuth is temporarily unavailable. Please try again in a moment.",
            )

        if not nonce_exists:
            raise HTTPException(status_code=400, detail="Invalid state")

        try:
            redis_client.delete(f"oauth_state:{nonce}")
        except Exception:
            logger.exception("oauth.state_store_unavailable operation=delete")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OAuth is temporarily unavailable. Please try again in a moment.",
            )

        return tenant_id, user_id

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")


# ── request.state → tenant / user helpers ───────────────────────────────


def _get_tenant_and_user(request: Request):
    """Extract tenant_id and user_id from the JWT-populated request context."""
    context = getattr(request.state, "request_context", None)

    tenant_id = getattr(context, "tenant_id", None) if context else None
    user_id = getattr(context, "user_id", None) if context else None

    if not tenant_id:
        raise HTTPException(status_code=400, detail="Missing tenant context")

    if not user_id:
        user_id = "anonymous"

    return tenant_id, user_id


# ── page / error helpers ───────────────────────────────────────────────


def _page_accounts(access_token: str):
    pages_response = requests.get(
        "https://graph.facebook.com/v18.0/me/accounts",
        params={"access_token": access_token},
        timeout=30,
    )
    if not pages_response.ok:
        _raise_provider_error("facebook", pages_response)
    return pages_response.json().get("data", [])


def _linkedin_headers(access_token: str):
    return {
        "Authorization": f"Bearer {access_token}",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": "202603",
        "Content-Type": "application/json",
    }


def _linkedin_person_urn(person_id: str) -> str:
    return f"urn:li:person:{person_id}"


LINKEDIN_ORGANIZATION_ADMIN_ROLES = (
    "ADMINISTRATOR",
    "DIRECT_SPONSORED_CONTENT_POSTER",
    "CONTENT_ADMINISTRATOR",
)


def _linkedin_organization_ids(access_token: str) -> list[str]:
    organization_ids: list[str] = []

    for role in LINKEDIN_ORGANIZATION_ADMIN_ROLES:
        response = requests.get(
            "https://api.linkedin.com/rest/organizationAcls",
            headers=_linkedin_headers(access_token),
            params={
                "q": "roleAssignee",
                "role": role,
                "state": "APPROVED",
            },
            timeout=30,
        )
        if response.status_code in {401, 403}:
            logger.info(
                "oauth.linkedin.organization_access_unavailable role=%s status=%s",
                role,
                response.status_code,
            )
            continue
        if not response.ok:
            _raise_provider_error("linkedin", response)

        elements = response.json().get("elements", [])
        for element in elements:
            organization_urn = (
                element.get("organization")
                or element.get("organizationTarget")
                or ""
            )
            if not isinstance(organization_urn, str) or not organization_urn:
                continue
            organization_id = organization_urn.rsplit(":", 1)[-1].strip()
            if organization_id and organization_id not in organization_ids:
                organization_ids.append(organization_id)

    return organization_ids


def _linkedin_organizations(access_token: str, organization_ids: list[str]) -> list[dict]:
    if not organization_ids:
        return []

    results: list[dict] = []
    for organization_id in organization_ids:
        response = requests.get(
            f"https://api.linkedin.com/rest/organizations/{organization_id}",
            headers=_linkedin_headers(access_token),
            timeout=30,
        )
        if response.status_code in {401, 403}:
            logger.info(
                "oauth.linkedin.organization_lookup_unavailable organization_id=%s status=%s",
                organization_id,
                response.status_code,
            )
            continue
        if not response.ok:
            _raise_provider_error("linkedin", response)
        payload = response.json()
        results.append(
            {
                "id": str(payload.get("id") or organization_id),
                "name": payload.get("localizedName")
                or payload.get("name", {}).get("localized", {}).get("en_US")
                or payload.get("vanityName")
                or f"LinkedIn Organization {organization_id}",
            }
        )
    return results


def _raise_provider_error(provider, response):
    try:
        payload = response.json()
    except Exception:
        payload = response.text

    logger.error(
        "oauth.provider_error provider=%s status_code=%s payload=%s",
        provider,
        response.status_code,
        payload,
    )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "provider": provider,
            "status_code": response.status_code,
            "response": payload,
        },
    )


def _detail_message(detail) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        provider = detail.get("provider")
        response = detail.get("response")
        if isinstance(response, str) and response.strip():
            return f"{provider or 'OAuth'}: {response}"
        if isinstance(response, dict):
            if response.get("error_description"):
                return f"{provider or 'OAuth'}: {response['error_description']}"
            if isinstance(response.get("error"), str):
                description = response.get("error_description")
                if description:
                    return f"{provider or 'OAuth'}: {description}"
                return f"{provider or 'OAuth'}: {response['error']}"
            error = response.get("error")
            if isinstance(error, dict) and error.get("message"):
                return f"{provider or 'OAuth'}: {error['message']}"
            if isinstance(error, dict) and error.get("detail"):
                return f"{provider or 'OAuth'}: {error['detail']}"
            if response.get("detail"):
                return f"{provider or 'OAuth'}: {response['detail']}"
            if response.get("title"):
                return f"{provider or 'OAuth'}: {response['title']}"
            errors = response.get("errors")
            if isinstance(errors, list) and errors:
                first_error = errors[0]
                if isinstance(first_error, dict):
                    for key in ("message", "detail", "reason"):
                        if first_error.get(key):
                            return f"{provider or 'OAuth'}: {first_error[key]}"
        return f"{provider or 'OAuth'} connection failed."
    return "OAuth flow failed."


def _dashboard_redirect(platform: str, result: str, message: str, count: int = 0) -> RedirectResponse:
    params = {
        "oauth_platform": platform,
        "oauth_result": result,
        "oauth_message": message,
    }
    if count:
        params["oauth_count"] = str(count)
    return RedirectResponse(f"{settings.frontend_url}/?{urlencode(params)}")


def _provider_query_error(platform: str, error: Optional[str], error_description: Optional[str]):
    if error:
        message = error_description or error.replace("_", " ")
        return _dashboard_redirect(platform, "error", message)
    return None


def _authorization_url_response(url: str):
    return {"authorization_url": url}


def _is_add_another(request: Request) -> bool:
    value = request.query_params.get("add_another", "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _store_verifier(nonce: str, verifier: str) -> None:
    try:
        redis_client.setex(f"pkce:twitter:{nonce}", 600, verifier)
    except Exception:
        logger.exception("oauth.state_store_unavailable operation=setex_twitter_pkce")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OAuth is temporarily unavailable. Please try again in a moment.",
        )


def _pop_verifier(nonce: str) -> Optional[str]:
    key = f"pkce:twitter:{nonce}"
    try:
        verifier = redis_client.get(key)
        redis_client.delete(key)
    except Exception:
        logger.exception("oauth.state_store_unavailable operation=getdelete_twitter_pkce")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OAuth is temporarily unavailable. Please try again in a moment.",
        )
    return verifier


def _facebook_authorization_url(tenant_id: str, user_id: str, add_another: bool = False) -> str:
    state = _build_state(tenant_id, user_id)
    params = {
        "client_id": settings.FACEBOOK_CLIENT_ID,
        "redirect_uri": settings.facebook_redirect_uri,
        "state": state,
        "scope": "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
    }
    if add_another:
        params["auth_type"] = "rerequest"
    return "https://www.facebook.com/v18.0/dialog/oauth?{0}".format(urlencode(params))


def _instagram_authorization_url(tenant_id: str, user_id: str, add_another: bool = False) -> str:
    state = _build_state(tenant_id, user_id)
    params = {
        "client_id": settings.FACEBOOK_CLIENT_ID,
        "redirect_uri": settings.instagram_redirect_uri,
        "state": state,
        "scope": "instagram_basic,instagram_content_publish,pages_show_list",
    }
    if add_another:
        params["auth_type"] = "rerequest"
    return "https://www.facebook.com/v18.0/dialog/oauth?{0}".format(urlencode(params))


def _linkedin_authorization_url(tenant_id: str, user_id: str, add_another: bool = False) -> str:
    state = _build_state(tenant_id, user_id)
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.linkedin_redirect_uri,
        "state": state,
        # Keep baseline scopes stable for all LinkedIn apps.
        # Organization scopes require additional LinkedIn product approvals
        # and can raise unauthorized_scope_error for many apps.
        "scope": "openid profile email w_member_social",
    }
    if add_another:
        params["prompt"] = "login"
    return "https://www.linkedin.com/oauth/v2/authorization?{0}".format(urlencode(params))


def _google_authorization_url(tenant_id: str, user_id: str, add_another: bool = False) -> str:
    return _google_scoped_authorization_url(
        tenant_id,
        user_id,
        settings.google_redirect_uri,
        [
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube.readonly",
        ],
        add_another=add_another,
    )


def _google_scoped_authorization_url(
    tenant_id: str,
    user_id: str,
    redirect_uri: str,
    scopes: list[str],
    add_another: bool = False,
) -> str:
    state = _build_state(tenant_id, user_id)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "select_account consent" if add_another else "consent",
        "state": state,
        "scope": " ".join(scopes),
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?{0}".format(urlencode(params))


def _blogger_authorization_url(tenant_id: str, user_id: str, add_another: bool = False) -> str:
    return _google_scoped_authorization_url(
        tenant_id,
        user_id,
        settings.blogger_redirect_uri,
        ["https://www.googleapis.com/auth/blogger"],
        add_another=add_another,
    )


def _google_business_authorization_url(tenant_id: str, user_id: str, add_another: bool = False) -> str:
    return _google_scoped_authorization_url(
        tenant_id,
        user_id,
        settings.google_business_redirect_uri,
        ["https://www.googleapis.com/auth/business.manage"],
        add_another=add_another,
    )


def _exchange_google_code(code: str, redirect_uri: str) -> dict:
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data=data,
        timeout=30,
    )
    if not token_response.ok:
        _raise_provider_error("google", token_response)
    return token_response.json()


def _google_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def _list_blogger_blogs(access_token: str) -> list[dict]:
    response = requests.get(
        "https://www.googleapis.com/blogger/v3/users/self/blogs",
        headers=_google_headers(access_token),
        timeout=30,
    )
    if not response.ok:
        _raise_provider_error("blogger", response)
    return response.json().get("items", [])


def _list_google_business_locations(access_token: str) -> list[dict]:
    accounts_response = requests.get(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
        headers=_google_headers(access_token),
        timeout=30,
    )
    if not accounts_response.ok:
        _raise_provider_error("google_business", accounts_response)

    locations: list[dict] = []
    for account in accounts_response.json().get("accounts", []):
        account_name = account.get("name")
        if not account_name:
            continue
        location_response = requests.get(
            f"https://mybusinessbusinessinformation.googleapis.com/v1/{account_name}/locations",
            headers=_google_headers(access_token),
            params={
                "pageSize": 100,
                "readMask": "name,title,storeCode,websiteUri",
            },
            timeout=30,
        )
        if location_response.status_code in {401, 403}:
            logger.info(
                "oauth.google_business.location_access_unavailable account=%s status=%s",
                account_name,
                location_response.status_code,
            )
            continue
        if not location_response.ok:
            _raise_provider_error("google_business", location_response)

        for location in location_response.json().get("locations", []):
            location_name = location.get("name")
            if not location_name:
                continue
            locations.append(
                {
                    "name": location_name,
                    "title": location.get("title") or location.get("storeCode") or location_name.rsplit("/", 1)[-1],
                }
            )

    return locations


def _twitter_authorization_url(tenant_id: str, user_id: str, add_another: bool = False) -> str:
    state = _build_state(tenant_id, user_id)
    decoded = json.loads(base64.urlsafe_b64decode(state.encode()).decode())
    nonce = decoded["nonce"]

    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("utf-8")).digest()
    ).decode("utf-8").rstrip("=")
    _store_verifier(nonce, verifier)

    params = {
        "response_type": "code",
        "client_id": settings.TWITTER_CLIENT_ID,
        "redirect_uri": settings.twitter_redirect_uri,
        "scope": "tweet.read tweet.write users.read offline.access",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if add_another:
        params["force_login"] = "true"

    return "https://x.com/i/oauth2/authorize?{0}".format(urlencode(params))


# ── Facebook ────────────────────────────────────────────────────────────

@router.get("/facebook/authorize")
def facebook_authorize(
    request: Request,
    add_another: bool = Query(default=False),
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.authorize.start tenant=%s user=%s provider=facebook", tenant_id, user_id)
    return _authorization_url_response(
        _facebook_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/facebook/login")
def facebook_login(
    request: Request,
    user=Depends(get_current_user)   # ✅ ADD THIS
):
    tenant_id, user_id = _get_tenant_and_user(request)

    logger.info(
        "oauth.login.start tenant=%s user=%s provider=facebook",
        tenant_id,
        user_id
    )

    return RedirectResponse(
        _facebook_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/facebook/callback")
def facebook_callback(
    state: Optional[str] = Query(default=None),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    provider_error = _provider_query_error("facebook", error, error_description)
    if provider_error is not None:
        return provider_error
    if not state:
        return _dashboard_redirect("facebook", "error", "Missing OAuth state from Facebook callback.")
    tenant_id, user_id = _validate_and_extract_state(state)
    if not code:
        return _dashboard_redirect("facebook", "error", "Facebook did not return an authorization code.")

    try:
        token_params = {
            "client_id": settings.FACEBOOK_CLIENT_ID,
            "client_secret": settings.FACEBOOK_SECRET,
            "redirect_uri": settings.facebook_redirect_uri,
            "code": code,
        }
        token_response = requests.get(
            "https://graph.facebook.com/v18.0/oauth/access_token",
            params=token_params,
            timeout=30,
        )
        if not token_response.ok:
            _raise_provider_error("facebook", token_response)

        token_data = token_response.json()
        access_token = token_data["access_token"]

        saved_accounts = []

        for page in _page_accounts(access_token):
            account = save_social_account(
                tenant_id=tenant_id,
                platform="facebook",
                platform_account_id=page["id"],
                account_name=page["name"],
                access_token=page["access_token"],
                account_type="page",
            )
            saved_accounts.append(account)

        logger.info(
            "oauth.callback.success tenant=%s user=%s provider=facebook accounts=%s",
            tenant_id,
            user_id,
            len(saved_accounts)
        )

        message = (
            f"Connected {len(saved_accounts)} Facebook page"
            f"{'' if len(saved_accounts) == 1 else 's'}."
        )
        return _dashboard_redirect("facebook", "success", message, len(saved_accounts))
    except HTTPException as exc:
        return _dashboard_redirect("facebook", "error", _detail_message(exc.detail))


# ── Instagram ───────────────────────────────────────────────────────────

@router.get("/instagram/authorize")
def instagram_authorize(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.authorize.start tenant=%s user=%s provider=instagram", tenant_id, user_id)
    return _authorization_url_response(
        _instagram_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/instagram/login")
def instagram_login(
    request: Request,
    user=Depends(get_current_user)   # ✅ ADD THIS
):
    tenant_id, user_id = _get_tenant_and_user(request)

    logger.info(
        "oauth.login.start tenant=%s user=%s provider=instagram",
        tenant_id,
        user_id
    )

    return RedirectResponse(
        _instagram_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )

@router.get("/instagram/callback")
def instagram_callback(
    state: Optional[str] = Query(default=None),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    provider_error = _provider_query_error("instagram", error, error_description)
    if provider_error is not None:
        return provider_error
    if not state:
        return _dashboard_redirect("instagram", "error", "Missing OAuth state from Instagram callback.")
    tenant_id, user_id = _validate_and_extract_state(state)
    if not code:
        return _dashboard_redirect(
            "instagram",
            "error",
            "Instagram did not return an authorization code.",
        )

    try:
        token_params = {
            "client_id": settings.FACEBOOK_CLIENT_ID,
            "client_secret": settings.FACEBOOK_SECRET,
            "redirect_uri": settings.instagram_redirect_uri,
            "code": code,
        }
        token_response = requests.get(
            "https://graph.facebook.com/v18.0/oauth/access_token",
            params=token_params,
            timeout=30,
        )
        if not token_response.ok:
            _raise_provider_error("instagram", token_response)

        token_data = token_response.json()
        access_token = token_data["access_token"]

        saved_accounts = []

        for page in _page_accounts(access_token):
            page_details = requests.get(
                f"https://graph.facebook.com/v18.0/{page['id']}",
                params={
                    "access_token": page["access_token"],
                    "fields": "instagram_business_account{id,username,profile_picture_url},name",
                },
                timeout=30,
            )
            if not page_details.ok:
                _raise_provider_error("instagram", page_details)

            page_data = page_details.json()
            instagram_account = page_data.get("instagram_business_account")
            if not instagram_account:
                continue

            account = save_social_account(
                tenant_id=tenant_id,
                platform="instagram",
                platform_account_id=instagram_account["id"],
                account_name=instagram_account.get("username") or page_data.get("name") or page["name"],
                access_token=page["access_token"],
                account_type="business_or_creator",
                profile_picture_url=instagram_account.get("profile_picture_url"),
            )
            saved_accounts.append(account)

        if not saved_accounts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Instagram requires a Business or Creator account linked to one of the authenticated Facebook Pages.",
            )

        logger.info(
            "oauth.callback.success tenant=%s user=%s provider=instagram accounts=%s",
            tenant_id,
            user_id,
            len(saved_accounts)
        )

        message = (
            f"Connected {len(saved_accounts)} Instagram professional account"
            f"{'' if len(saved_accounts) == 1 else 's'}."
        )
        return _dashboard_redirect("instagram", "success", message, len(saved_accounts))
    except HTTPException as exc:
        return _dashboard_redirect("instagram", "error", _detail_message(exc.detail))


# ── LinkedIn ────────────────────────────────────────────────────────────


from fastapi import Depends
from app.utils.deps import get_current_user

@router.get("/linkedin/authorize")
def linkedin_authorize(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.authorize.start tenant=%s user=%s provider=linkedin", tenant_id, user_id)
    return _authorization_url_response(
        _linkedin_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/linkedin/login")
def linkedin_login(
    request: Request,
    user=Depends(get_current_user)   # ✅ ADD THIS
):
    tenant_id, user_id = _get_tenant_and_user(request)

    logger.info(
        "oauth.login.start tenant=%s user=%s provider=linkedin",
        tenant_id,
        user_id
    )

    return RedirectResponse(
        _linkedin_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )

@router.get("/linkedin/callback")
def linkedin_callback(
    state: Optional[str] = Query(default=None),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    provider_error = _provider_query_error("linkedin", error, error_description)
    if provider_error is not None:
        return provider_error
    if not state:
        return _dashboard_redirect("linkedin", "error", "Missing OAuth state from LinkedIn callback.")
    tenant_id, user_id = _validate_and_extract_state(state)
    if not code:
        return _dashboard_redirect(
            "linkedin",
            "error",
            "LinkedIn did not return an authorization code.",
        )

    try:
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.linkedin_redirect_uri,
            "client_id": settings.LINKEDIN_CLIENT_ID,
            "client_secret": settings.LINKEDIN_SECRET,
        }
        token_response = requests.post(
            "https://www.linkedin.com/oauth/v2/accessToken",
            data=data,
            timeout=30,
        )
        if not token_response.ok:
            _raise_provider_error("linkedin", token_response)

        token_data = token_response.json()
        access_token = token_data["access_token"]

        # switched from /v2/me to /v2/userinfo (OpenID Connect endpoint)
        profile_response = requests.get(
            "https://api.linkedin.com/v2/userinfo",
            headers={"Authorization": "Bearer {0}".format(access_token)},
            timeout=30,
        )
        if not profile_response.ok:
            _raise_provider_error("linkedin", profile_response)

        profile = profile_response.json()
        # /v2/userinfo returns "sub" instead of "id"
        saved_accounts = []

        personal_account = save_social_account(
            tenant_id=tenant_id,
            platform="linkedin",
            platform_account_id=profile["sub"],
            account_name=profile.get("name", "LinkedIn Profile"),
            access_token=access_token,
            account_type="personal_profile",
        )
        saved_accounts.append(personal_account)

        organization_ids = _linkedin_organization_ids(access_token)
        organizations = _linkedin_organizations(access_token, organization_ids)
        for organization in organizations:
            account = save_social_account(
                tenant_id=tenant_id,
                platform="linkedin",
                platform_account_id=organization["id"],
                account_name=organization["name"],
                access_token=access_token,
                account_type="organization",
            )
            saved_accounts.append(account)

        logger.info(
            "oauth.callback.success tenant=%s user=%s provider=linkedin accounts=%s",
            tenant_id,
            user_id,
            len(saved_accounts)
        )

        organization_count = max(len(saved_accounts) - 1, 0)
        if organization_count:
            message = (
                f"Connected your LinkedIn profile and {organization_count} organization"
                f"{'' if organization_count == 1 else 's'}."
            )
        else:
            message = "Connected your LinkedIn profile."
        return _dashboard_redirect("linkedin", "success", message, len(saved_accounts))
    except HTTPException as exc:
        return _dashboard_redirect("linkedin", "error", _detail_message(exc.detail))


# ── Google / YouTube ────────────────────────────────────────────────────


@router.get("/google/authorize")
def google_authorize(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.authorize.start tenant=%s user=%s provider=youtube", tenant_id, user_id)
    return _authorization_url_response(
        _google_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/google/login")
def google_login(
    request: Request,
    user=Depends(get_current_user)   # ✅ ADD THIS
):
    tenant_id, user_id = _get_tenant_and_user(request)

    logger.info(
        "oauth.login.start tenant=%s user=%s provider=youtube",
        tenant_id,
        user_id
    )

    return RedirectResponse(
        _google_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )

@router.get("/google/callback")
def google_callback(
    state: Optional[str] = Query(default=None),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    provider_error = _provider_query_error("youtube", error, error_description)
    if provider_error is not None:
        return provider_error
    if not state:
        return _dashboard_redirect("youtube", "error", "Missing OAuth state from Google callback.")
    tenant_id, user_id = _validate_and_extract_state(state)
    if not code:
        return _dashboard_redirect("youtube", "error", "Google did not return an authorization code.")

    try:
        tokens = _exchange_google_code(code, settings.google_redirect_uri)

        channel_response = requests.get(
            "https://www.googleapis.com/youtube/v3/channels",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            params={"part": "snippet", "mine": "true"},
            timeout=30,
        )
        if not channel_response.ok:
            _raise_provider_error("google", channel_response)

        channel_items = channel_response.json().get("items", [])
        if not channel_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No YouTube channel was found for the authenticated Google account.",
            )

        channel = channel_items[0]
        channel_snippet = channel.get("snippet", {})

        save_social_account(
            tenant_id=tenant_id,
            platform="youtube",
            platform_account_id=channel["id"],
            account_name=channel_snippet.get("title", "YouTube"),
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            expires_in=tokens.get("expires_in"),
            account_type="channel",
            profile_picture_url=(channel_snippet.get("thumbnails", {}).get("default") or {}).get("url"),
        )

        logger.info(
            "oauth.callback.success tenant=%s user=%s provider=youtube accounts=%s",
            tenant_id,
            user_id,
            1
        )

        return _dashboard_redirect("youtube", "success", "Connected your YouTube channel.", 1)
    except HTTPException as exc:
        return _dashboard_redirect("youtube", "error", _detail_message(exc.detail))


@router.get("/blogger/authorize")
def blogger_authorize(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.authorize.start tenant=%s user=%s provider=blogger", tenant_id, user_id)
    return _authorization_url_response(
        _blogger_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/blogger/login")
def blogger_login(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.login.start tenant=%s user=%s provider=blogger", tenant_id, user_id)
    return RedirectResponse(
        _blogger_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/blogger/callback")
def blogger_callback(
    state: Optional[str] = Query(default=None),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    provider_error = _provider_query_error("blogger", error, error_description)
    if provider_error is not None:
        return provider_error
    if not state:
        return _dashboard_redirect("blogger", "error", "Missing OAuth state from Blogger callback.")
    tenant_id, user_id = _validate_and_extract_state(state)
    if not code:
        return _dashboard_redirect("blogger", "error", "Google did not return a Blogger authorization code.")

    try:
        tokens = _exchange_google_code(code, settings.blogger_redirect_uri)
        saved_accounts = []
        for blog in _list_blogger_blogs(tokens["access_token"]):
            account = save_social_account(
                tenant_id=tenant_id,
                platform="blogger",
                platform_account_id=str(blog.get("id", "")),
                account_name=blog.get("name") or "Blogger Blog",
                access_token=tokens["access_token"],
                refresh_token=tokens.get("refresh_token"),
                expires_in=tokens.get("expires_in"),
                account_type="blog",
                profile_picture_url=(blog.get("posts") or {}).get("selfLink"),
            )
            saved_accounts.append(account)

        if not saved_accounts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No Blogger blogs were found for the authenticated Google account.",
            )

        logger.info(
            "oauth.callback.success tenant=%s user=%s provider=blogger accounts=%s",
            tenant_id,
            user_id,
            len(saved_accounts)
        )
        message = (
            f"Connected {len(saved_accounts)} Blogger blog"
            f"{'' if len(saved_accounts) == 1 else 's'}."
        )
        return _dashboard_redirect("blogger", "success", message, len(saved_accounts))
    except HTTPException as exc:
        return _dashboard_redirect("blogger", "error", _detail_message(exc.detail))


@router.get("/google_business/authorize")
def google_business_authorize(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.authorize.start tenant=%s user=%s provider=google_business", tenant_id, user_id)
    return _authorization_url_response(
        _google_business_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/google_business/login")
def google_business_login(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.login.start tenant=%s user=%s provider=google_business", tenant_id, user_id)
    return RedirectResponse(
        _google_business_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/google_business/callback")
def google_business_callback(
    state: Optional[str] = Query(default=None),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    provider_error = _provider_query_error("google_business", error, error_description)
    if provider_error is not None:
        return provider_error
    if not state:
        return _dashboard_redirect("google_business", "error", "Missing OAuth state from Google Business callback.")
    tenant_id, user_id = _validate_and_extract_state(state)
    if not code:
        return _dashboard_redirect("google_business", "error", "Google did not return a Business Profile authorization code.")

    try:
        tokens = _exchange_google_code(code, settings.google_business_redirect_uri)
        saved_accounts = []
        for location in _list_google_business_locations(tokens["access_token"]):
            account = save_social_account(
                tenant_id=tenant_id,
                platform="google_business",
                platform_account_id=location["name"],
                account_name=location["title"],
                access_token=tokens["access_token"],
                refresh_token=tokens.get("refresh_token"),
                expires_in=tokens.get("expires_in"),
                account_type="business_location",
            )
            saved_accounts.append(account)

        if not saved_accounts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No Google Business Profile locations were found for the authenticated Google account.",
            )

        logger.info(
            "oauth.callback.success tenant=%s user=%s provider=google_business accounts=%s",
            tenant_id,
            user_id,
            len(saved_accounts)
        )
        message = (
            f"Connected {len(saved_accounts)} Google Business location"
            f"{'' if len(saved_accounts) == 1 else 's'}."
        )
        return _dashboard_redirect("google_business", "success", message, len(saved_accounts))
    except HTTPException as exc:
        return _dashboard_redirect("google_business", "error", _detail_message(exc.detail))


# ── Twitter / X ─────────────────────────────────────────────────────────

@router.get("/twitter/authorize")
def twitter_authorize(
    request: Request,
    user=Depends(get_current_user)
):
    tenant_id, user_id = _get_tenant_and_user(request)
    logger.info("oauth.authorize.start tenant=%s user=%s provider=twitter", tenant_id, user_id)
    return _authorization_url_response(
        _twitter_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )


@router.get("/twitter/login")
def twitter_login(
    request: Request,
    user=Depends(get_current_user)   # ✅ ADD THIS LINE
):
    tenant_id, user_id = _get_tenant_and_user(request)

    logger.info(
        "oauth.login.start tenant=%s user=%s provider=twitter",
        tenant_id,
        user_id
    )

    return RedirectResponse(
        _twitter_authorization_url(tenant_id, user_id, add_another=_is_add_another(request))
    )

@router.get("/twitter/callback")
def twitter_callback(
    state: Optional[str] = Query(default=None),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    provider_error = _provider_query_error("twitter", error, error_description)
    if provider_error is not None:
        return provider_error
    if not state:
        return _dashboard_redirect("twitter", "error", "Missing OAuth state from X callback.")
    tenant_id, user_id = _validate_and_extract_state(state)

    # decode nonce after validation (safe version)
    decoded = json.loads(base64.urlsafe_b64decode(state.encode()).decode())
    nonce = decoded["nonce"]
    if not code:
        return _dashboard_redirect("twitter", "error", "X did not return an authorization code.")

    try:
        verifier = _pop_verifier(nonce)
        if not verifier:
            return _dashboard_redirect("twitter", "error", "Missing Twitter code verifier.")

        basic_token = base64.b64encode(
            f"{settings.TWITTER_CLIENT_ID}:{settings.TWITTER_CLIENT_SECRET}".encode("utf-8")
        ).decode("utf-8")

        token_response = requests.post(
            "https://api.x.com/2/oauth2/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.twitter_redirect_uri,
                "code_verifier": verifier,
            },
            headers={
                "Authorization": f"Basic {basic_token}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=30,
        )
        if not token_response.ok:
            _raise_provider_error("twitter", token_response)

        token_data = token_response.json()
        access_token = token_data["access_token"]

        user_response = requests.get(
            "https://api.x.com/2/users/me",
            headers={"Authorization": "Bearer {0}".format(access_token)},
            timeout=30,
        )
        if not user_response.ok:
            _raise_provider_error("twitter", user_response)

        user_data = user_response.json().get("data", {})

        save_social_account(
            tenant_id=tenant_id,
            platform="twitter",
            platform_account_id=user_data.get("id", ""),
            account_name=user_data.get("name", "Twitter User"),
            access_token=access_token,
            refresh_token=token_data.get("refresh_token"),
            expires_in=token_data.get("expires_in"),
            account_type="personal_or_brand",
        )

        logger.info(
            "oauth.callback.success tenant=%s user=%s provider=twitter accounts=%s",
            tenant_id,
            user_id,
            1
        )

        return _dashboard_redirect("twitter", "success", "Connected your X account.", 1)
    except HTTPException as exc:
        logger.error("oauth.twitter_callback_failed detail=%s", exc.detail)
        return _dashboard_redirect("twitter", "error", _detail_message(exc.detail))
