from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud.account import (
    create_account,
    delete_account,
    get_account_by_id,
    get_account_status_summary,
    list_accounts,
    set_account_active,
    update_account,
)
from app.schemas.account import (
    AccountActiveUpdate,
    AccountCreate,
    AccountRead,
    AccountStatusResponse,
    AccountUpdate,
    WordPressConnectRequest,
)
from app.services.oauth_service import save_social_account
from app.utils.deps import get_db, get_tenant

router = APIRouter()


def _normalize_wordpress_site_url(site_url: str) -> str:
    normalized = site_url.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WordPress site URL is required",
        )
    if not normalized.startswith(("http://", "https://")):
        normalized = f"https://{normalized}"
    return normalized.rstrip("/")


@router.post("/", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account_endpoint(
    data: AccountCreate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    return create_account(db, tenant_id, data)


@router.post("/wordpress/connect", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def connect_wordpress_site(
    data: WordPressConnectRequest,
    tenant_id: str = Depends(get_tenant),
):
    site_url = _normalize_wordpress_site_url(data.site_url)
    username = data.username.strip()
    application_password = data.application_password.strip()

    if not username or not application_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WordPress username and application password are required",
        )

    me_response = requests.get(
        f"{site_url}/wp-json/wp/v2/users/me",
        auth=(username, application_password),
        timeout=30,
    )
    if me_response.status_code in {401, 403}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WordPress rejected the username or application password.",
        )
    if not me_response.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to verify the WordPress site. Status: {me_response.status_code}",
        )

    site_response = requests.get(
        f"{site_url}/wp-json",
        timeout=30,
    )
    site_name = data.account_name.strip() if data.account_name else ""
    if site_response.ok:
        payload = site_response.json()
        site_name = site_name or payload.get("name") or payload.get("description") or ""

    parsed = urlparse(site_url)
    hostname = parsed.netloc or site_url
    display_name = site_name or hostname
    platform_account_id = f"{site_url}|{username}"

    account = save_social_account(
        tenant_id=tenant_id,
        platform="wordpress",
        platform_account_id=platform_account_id,
        account_name=display_name,
        access_token=application_password,
        refresh_token=username,
        account_type="wordpress_site",
    )
    return account


@router.get("/", response_model=list[AccountRead])
def list_accounts_endpoint(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    return list_accounts(db, tenant_id)


@router.get("/status", response_model=AccountStatusResponse)
def get_account_status_endpoint(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    return get_account_status_summary(db, tenant_id)


@router.get("/{account_id}", response_model=AccountRead)
def get_account_endpoint(
    account_id: int,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    account = get_account_by_id(db, tenant_id, account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.patch("/{account_id}", response_model=AccountRead)
def update_account_endpoint(
    account_id: int,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    account = update_account(db, tenant_id, account_id, data)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.patch("/{account_id}/active", response_model=AccountRead)
def set_account_active_endpoint(
    account_id: int,
    data: AccountActiveUpdate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    account = set_account_active(db, tenant_id, account_id, data.is_active)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account_endpoint(
    account_id: int,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    deleted = delete_account(db, tenant_id, account_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return None
