from pydantic import BaseModel, ConfigDict
from typing import Optional


class AccountCreate(BaseModel):
    platform: str
    account_type: Optional[str] = None
    platform_account_id: str
    account_name: str
    profile_picture_url: Optional[str] = None
    token: str
    refresh_token: Optional[str] = None


class AccountUpdate(BaseModel):
    account_type: Optional[str] = None
    account_name: Optional[str] = None
    profile_picture_url: Optional[str] = None


class AccountActiveUpdate(BaseModel):
    is_active: bool


class AccountRead(BaseModel):
    id: int
    tenant_id: str
    platform: str
    account_type: Optional[str] = None
    platform_account_id: str
    account_name: str
    profile_picture_url: Optional[str] = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class AccountStatusItem(BaseModel):
    connected: bool
    active_accounts: int


class AccountStatusResponse(BaseModel):
    facebook: AccountStatusItem
    instagram: AccountStatusItem
    linkedin: AccountStatusItem
    twitter: AccountStatusItem
    youtube: AccountStatusItem
    blogger: AccountStatusItem
    google_business: AccountStatusItem
    wordpress: AccountStatusItem


class WordPressConnectRequest(BaseModel):
    site_url: str
    username: str
    application_password: str
    account_name: Optional[str] = None
