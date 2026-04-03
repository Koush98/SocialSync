from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    social_account_id: int
    content: Optional[str] = None
    platform_options: Optional[Dict] = Field(default_factory=dict)
    scheduled_at: Optional[datetime] = None
    media_ids: Optional[List[int]] = Field(default_factory=list)


class PostRead(BaseModel):
    id: int
    social_account_id: int
    tenant_id: str
    platform: str
    content: Optional[str] = None
    platform_options: Dict = Field(default_factory=dict)
    scheduled_at: Optional[datetime] = None
    posted_at: Optional[datetime] = None
    status: str
    retry_count: int
    max_retries: int
    error_message: Optional[str] = None
    platform_post_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PostCreateResponse(BaseModel):
    post_id: int
    status: str
    task_id: Optional[str] = None
