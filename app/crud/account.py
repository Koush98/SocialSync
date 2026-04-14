from sqlalchemy.orm import Session

from app.models.social_account import SocialAccount
from app.schemas.account import AccountCreate, AccountUpdate


def create_account(db: Session, tenant_id: str, data: AccountCreate):
    account = SocialAccount(
        tenant_id=tenant_id,
        platform=data.platform,
        account_type=data.account_type,
        platform_account_id=data.platform_account_id,
        account_name=data.account_name,
        profile_picture_url=data.profile_picture_url,
        encrypted_token=data.token,
        encrypted_refresh_token=data.refresh_token,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def list_accounts(db: Session, tenant_id: str):
    return (
        db.query(SocialAccount)
        .filter(SocialAccount.tenant_id == tenant_id)
        .order_by(SocialAccount.id.desc())
        .all()
    )


def get_account_by_id(db: Session, tenant_id: str, account_id: int):
    return (
        db.query(SocialAccount)
        .filter(
            SocialAccount.id == account_id,
            SocialAccount.tenant_id == tenant_id,
        )
        .first()
    )


def update_account(db: Session, tenant_id: str, account_id: int, data: AccountUpdate):
    account = get_account_by_id(db, tenant_id, account_id)
    if not account:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)
    return account


def set_account_active(db: Session, tenant_id: str, account_id: int, is_active: bool):
    account = get_account_by_id(db, tenant_id, account_id)
    if not account:
        return None

    account.is_active = is_active
    db.commit()
    db.refresh(account)
    return account


def delete_account(db: Session, tenant_id: str, account_id: int):
    account = get_account_by_id(db, tenant_id, account_id)
    if not account:
        return False

    db.delete(account)
    db.commit()
    return True


def get_account_status_summary(db: Session, tenant_id: str):
    accounts = list_accounts(db, tenant_id)

    summary = {
        "facebook": {"connected": False, "active_accounts": 0},
        "instagram": {"connected": False, "active_accounts": 0},
        "linkedin": {"connected": False, "active_accounts": 0},
        "twitter": {"connected": False, "active_accounts": 0},
        "youtube": {"connected": False, "active_accounts": 0},
        "blogger": {"connected": False, "active_accounts": 0},
        "google_business": {"connected": False, "active_accounts": 0},
        "wordpress": {"connected": False, "active_accounts": 0},
    }

    for account in accounts:
        platform = account.platform.lower()
        if platform not in summary:
            continue

        summary[platform]["connected"] = True
        if account.is_active:
            summary[platform]["active_accounts"] += 1

    return summary
