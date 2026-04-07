from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)


def set_request_context(db, tenant_id: str, user_id: str = "", role: str = "user") -> None:
    db.execute(
        text(
            """
            SELECT
                set_config('app.tenant_id', :tenant_id, false),
                set_config('app.user_id', :user_id, false),
                set_config('app.role', :role, false)
            """
        ),
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "role": role,
        },
    )


def set_tenant_context(db, tenant_id: str) -> None:
    set_request_context(db, tenant_id)


def reset_tenant_context(db) -> None:
    db.execute(
        text(
            """
            RESET app.tenant_id;
            RESET app.user_id;
            RESET app.role
            """
        )
    )
