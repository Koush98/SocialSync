import base64
import hashlib
import secrets
from typing import Optional
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Query, status

import requests
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis_client import redis_client
from app.services.oauth_service import save_social_account

router = APIRouter()
settings = get_settings()
logger = get_logger("app.oauth")


def _build_state(tenant_id: str):
    nonce = secrets.token_urlsafe(16)
    return "{0}:{1}".format(tenant_id, nonce)


def _extract_tenant_and_nonce_from_state(state: str):
    if not state or ":" not in state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state",
        )
    tenant_id, nonce = state.split(":", 1)
    if not tenant_id or not nonce:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state",
        )
    return tenant_id, nonce


def _extract_tenant_from_state(state: str):
    tenant_id, _ = _extract_tenant_and_nonce_from_state(state)
    return tenant_id


def _page_accounts(access_token: str):
    pages_response = requests.get(
        "https://graph.facebook.com/v18.0/me/accounts",
        params={"access_token": access_token},
        timeout=30,
    )
    if not pages_response.ok:
        _raise_provider_error("facebook", pages_response)
    return pages_response.json().get("data", [])


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


def _store_verifier(nonce: str, verifier: str) -> None:
    redis_client.setex(f"pkce:twitter:{nonce}", 600, verifier)


def _pop_verifier(nonce: str) -> Optional[str]:
    key = f"pkce:twitter:{nonce}"
    verifier = redis_client.get(key)
    redis_client.delete(key)
    return verifier


@router.get("/facebook/login")
def facebook_login(tenant_id: str = Query(...)):
    state = _build_state(tenant_id)
    params = {
        "client_id": settings.FACEBOOK_CLIENT_ID,
        "redirect_uri": settings.facebook_redirect_uri,
        "state": state,
        "scope": "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
    }
    url = "https://www.facebook.com/v18.0/dialog/oauth?{0}".format(urlencode(params))
    return RedirectResponse(url)


@router.get("/facebook/callback")
def facebook_callback(
    state: str = Query(...),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    tenant_id = _extract_tenant_from_state(state)
    provider_error = _provider_query_error("facebook", error, error_description)
    if provider_error is not None:
        return provider_error
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

        message = (
            f"Connected {len(saved_accounts)} Facebook page"
            f"{'' if len(saved_accounts) == 1 else 's'}."
        )
        return _dashboard_redirect("facebook", "success", message, len(saved_accounts))
    except HTTPException as exc:
        return _dashboard_redirect("facebook", "error", _detail_message(exc.detail))


@router.get("/instagram/login")
def instagram_login(tenant_id: str = Query(...)):
    state = _build_state(tenant_id)
    params = {
        "client_id": settings.FACEBOOK_CLIENT_ID,
        "redirect_uri": settings.instagram_redirect_uri,
        "state": state,
        "scope": "instagram_basic,instagram_content_publish,pages_show_list",
    }
    url = "https://www.facebook.com/v18.0/dialog/oauth?{0}".format(urlencode(params))
    return RedirectResponse(url)


@router.get("/instagram/callback")
def instagram_callback(
    state: str = Query(...),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    tenant_id = _extract_tenant_from_state(state)
    provider_error = _provider_query_error("instagram", error, error_description)
    if provider_error is not None:
        return provider_error
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

        message = (
            f"Connected {len(saved_accounts)} Instagram professional account"
            f"{'' if len(saved_accounts) == 1 else 's'}."
        )
        return _dashboard_redirect("instagram", "success", message, len(saved_accounts))
    except HTTPException as exc:
        return _dashboard_redirect("instagram", "error", _detail_message(exc.detail))


@router.get("/linkedin/login")
def linkedin_login(tenant_id: str = Query(...)):
    state = _build_state(tenant_id)
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.linkedin_redirect_uri,
        "state": state,
        "scope": "openid profile email w_member_social",  # replaced r_liteprofile
    }
    url = "https://www.linkedin.com/oauth/v2/authorization?{0}".format(urlencode(params))
    return RedirectResponse(url)


@router.get("/linkedin/callback")
def linkedin_callback(
    state: str = Query(...),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    tenant_id = _extract_tenant_from_state(state)
    provider_error = _provider_query_error("linkedin", error, error_description)
    if provider_error is not None:
        return provider_error
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
        account = save_social_account(
            tenant_id=tenant_id,
            platform="linkedin",
            platform_account_id=profile["sub"],
            account_name=profile.get("name", "LinkedIn Profile"),
            access_token=access_token,
            account_type="personal_profile",
        )
        return _dashboard_redirect("linkedin", "success", "Connected your LinkedIn profile.", 1)
    except HTTPException as exc:
        return _dashboard_redirect("linkedin", "error", _detail_message(exc.detail))

@router.get("/google/login")
def google_login(tenant_id: str = Query(...)):
    state = _build_state(tenant_id)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",

    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?{0}".format(urlencode(params))
    return RedirectResponse(url)


@router.get("/google/callback")
def google_callback(
    state: str = Query(...),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    tenant_id = _extract_tenant_from_state(state)
    provider_error = _provider_query_error("youtube", error, error_description)
    if provider_error is not None:
        return provider_error
    if not code:
        return _dashboard_redirect("youtube", "error", "Google did not return an authorization code.")

    try:
        data = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_SECRET,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        }
        token_response = requests.post(
            "https://oauth2.googleapis.com/token",
            data=data,
            timeout=30,
        )
        if not token_response.ok:
            _raise_provider_error("google", token_response)

        tokens = token_response.json()

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

        return _dashboard_redirect("youtube", "success", "Connected your YouTube channel.", 1)
    except HTTPException as exc:
        return _dashboard_redirect("youtube", "error", _detail_message(exc.detail))


@router.get("/twitter/login")
def twitter_login(tenant_id: str = Query(...)):
    state = _build_state(tenant_id)
    _, nonce = _extract_tenant_and_nonce_from_state(state)
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

    url = "https://x.com/i/oauth2/authorize?{0}".format(urlencode(params))
    return RedirectResponse(url)


@router.get("/twitter/callback")
def twitter_callback(
    state: str = Query(...),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    tenant_id, nonce = _extract_tenant_and_nonce_from_state(state)

    provider_error = _provider_query_error("twitter", error, error_description)
    if provider_error is not None:
        return provider_error
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

        return _dashboard_redirect("twitter", "success", "Connected your X account.", 1)
    except HTTPException as exc:
        logger.error("oauth.twitter_callback_failed detail=%s", exc.detail)
        return _dashboard_redirect("twitter", "error", _detail_message(exc.detail))
