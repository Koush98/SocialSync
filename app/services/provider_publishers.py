"""
Production-ready social media publisher service.

Supports Facebook, Instagram, LinkedIn, Twitter, and YouTube publishing
with comprehensive error handling, media validation, duplicate detection,
and structured logging.
"""
import html
import hashlib
import json
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote

import requests

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis_client import redis_client
from app.core.security import decrypt_token, encrypt_token
from app.models.media_asset import MediaAsset
from app.models.scheduled_post import ScheduledPost
from app.models.social_account import SocialAccount

logger = get_logger("app.provider_publishers")
settings = get_settings()
LINKEDIN_VERSION = "202603"
TWITTER_MEDIA_CHUNK_SIZE = 4 * 1024 * 1024

# ============================================================================
# CUSTOM EXCEPTIONS
# ============================================================================


class ProviderAPIError(Exception):
    """Base exception for provider API errors."""

    def __init__(self, message: str, retryable: bool = True, error_code: Optional[int] = None):
        super().__init__(message)
        self.retryable = retryable
        self.error_code = error_code


class RateLimitError(ProviderAPIError):
    """Rate limit exceeded error."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: Optional[int] = None):
        super().__init__(message, retryable=True)
        self.retry_after = retry_after


class TokenExpiredError(ProviderAPIError):
    """Authentication token has expired."""

    def __init__(self, message: str = "Token expired"):
        super().__init__(message, retryable=False)


class MediaValidationError(Exception):
    """Media validation failed."""

    def __init__(self, message: str):
        super().__init__(message)


class DuplicatePostError(Exception):
    """Duplicate post detected within time window."""

    def __init__(self, message: str = "Duplicate post detected"):
        super().__init__(message)


class PublishError(ProviderAPIError):
    """Legacy publish error for backward compatibility."""

    pass


class UnsupportedPublishError(PublishError):
    """Unsupported publish operation."""

    def __init__(self, message: str):
        super().__init__(message, retryable=False)


# ============================================================================
# MEDIA VALIDATION LAYER
# ============================================================================

# Platform-specific media constraints
MEDIA_CONSTRAINTS = {
    "facebook": {
        "image": {
            "allowed_extensions": {"jpg", "jpeg", "png"},
            "max_size_mb": 25,
            "max_size_bytes": 25 * 1024 * 1024,
        },
        "video": {
            "allowed_extensions": {"mp4"},
            "max_size_mb": 1000,  # 1GB
            "max_size_bytes": 1000 * 1024 * 1024,
            "max_duration_seconds": 240 * 60,  # 4 hours
        },
    },
    "instagram": {
        "image": {
            "allowed_extensions": {"jpg", "jpeg", "png"},
            "max_size_mb": 8,
            "max_size_bytes": 8 * 1024 * 1024,
            "min_aspect_ratio": 4.0 / 5.0,  # 4:5
            "max_aspect_ratio": 1.91 / 1.0,  # 1.91:1
        },
        "video": {
            "allowed_extensions": {"mp4"},
            "max_size_mb": 100,
            "max_size_bytes": 100 * 1024 * 1024,
            "max_duration_seconds": 60,  # Reels safe limit
        },
    },
}


def validate_media_for_platform(media: MediaAsset, platform: str, media_index: int = 0) -> None:
    """
    Validate media asset against platform-specific constraints.

    Args:
        media: MediaAsset object to validate
        platform: Target platform ("facebook" or "instagram")
        media_index: Index in media list (for error messages)

    Raises:
        MediaValidationError: If media doesn't meet platform requirements
    """
    if platform not in MEDIA_CONSTRAINTS:
        logger.warning(f"No validation constraints for platform: {platform}")
        return

    constraints = MEDIA_CONSTRAINTS.get(platform, {}).get(media.file_type)
    if not constraints:
        raise MediaValidationError(
            f"Unsupported media type '{media.file_type}' for {platform}"
        )

    # Check file extension from URL or mime_type
    file_ext = _extract_file_extension(media.file_url, media.mime_type)
    allowed_extensions = constraints.get("allowed_extensions", set())
    if allowed_extensions and file_ext not in allowed_extensions:
        raise MediaValidationError(
            f"Media {media_index}: File extension '{file_ext}' not allowed for {platform} {media.file_type}. "
            f"Allowed: {', '.join(allowed_extensions)}"
        )

    # Check file size
    max_size_bytes = constraints.get("max_size_bytes")
    if max_size_bytes and media.file_size_bytes and media.file_size_bytes > max_size_bytes:
        max_size_mb = constraints.get("max_size_mb", max_size_bytes / (1024 * 1024))
        actual_size_mb = media.file_size_bytes / (1024 * 1024)
        raise MediaValidationError(
            f"Media {media_index}: File size {actual_size_mb:.2f}MB exceeds {platform} limit of {max_size_mb}MB"
        )

    # Check aspect ratio for Instagram images
    if platform == "instagram" and media.file_type == "image":
        if media.width_px and media.height_px:
            aspect_ratio = media.width_px / media.height_px
            min_ratio = constraints.get("min_aspect_ratio", 0)
            max_ratio = constraints.get("max_aspect_ratio", float("inf"))
            if aspect_ratio < min_ratio or aspect_ratio > max_ratio:
                raise MediaValidationError(
                    f"Media {media_index}: Aspect ratio {aspect_ratio:.2f}:1 outside allowed range "
                    f"{min_ratio:.2f}:1 to {max_ratio:.2f}:1 for Instagram"
                )

    # Check video duration
    if media.file_type == "video":
        max_duration = constraints.get("max_duration_seconds")
        if max_duration and media.duration_seconds and media.duration_seconds > max_duration:
            raise MediaValidationError(
                f"Media {media_index}: Video duration {media.duration_seconds}s exceeds "
                f"{platform} limit of {max_duration}s"
            )


def _extract_file_extension(url: str, mime_type: Optional[str] = None) -> str:
    """Extract file extension from URL or MIME type."""
    # Try from MIME type first
    if mime_type:
        ext_map = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "video/mp4": "mp4",
        }
        if mime_type.lower() in ext_map:
            return ext_map[mime_type.lower()]

    # Try from URL
    url_lower = url.lower().split("?")[0]  # Remove query params
    if "." in url_lower:
        ext = url_lower.rsplit(".", 1)[-1]
        return ext

    return ""


def validate_carousel_media(media_assets: List[MediaAsset], platform: str) -> None:
    """
    Validate carousel media list for platform-specific rules.

    Args:
        media_assets: List of media assets
        platform: Target platform

    Raises:
        MediaValidationError: If carousel doesn't meet platform requirements
    """
    if not media_assets:
        raise MediaValidationError("Carousel requires at least one media item")

    if platform == "instagram":
        if len(media_assets) > 10:
            raise MediaValidationError(
                f"Instagram carousel supports maximum 10 items, got {len(media_assets)}"
            )
        # All must be same type
        types = set(m.file_type for m in media_assets)
        if len(types) > 1:
            raise MediaValidationError(
                f"Instagram carousel must contain same media type, got: {', '.join(types)}"
            )
    elif platform == "facebook":
        # Facebook carousel: images only (no mixing with video)
        if any(m.file_type == "video" for m in media_assets):
            raise MediaValidationError(
                "Facebook carousel supports images only (no video mixing)"
            )

    # Validate each media item
    for idx, media in enumerate(media_assets):
        validate_media_for_platform(media, platform, idx)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def _raise_provider_error(
    provider: str,
    response: requests.Response,
    retryable: bool = True,
) -> None:
    """
    Raise structured provider error based on API response.

    Maps Meta API error codes to specific exception types:
    - code 190: TokenExpiredError
    - code 4: RateLimitError
    """
    try:
        payload: Any = response.json()
    except Exception:
        payload = response.text

    # Extract Meta API error code if available
    error_code = None
    error_message = str(payload)

    if isinstance(payload, dict):
        error_data = payload.get("error", {})
        if isinstance(error_data, dict):
            error_code = error_data.get("code")
            error_message = error_data.get("message", str(payload))

            # Map Meta API error codes to specific exceptions
            if error_code == 190:
                raise TokenExpiredError(
                    f"{provider} token expired: {error_message}"
                )
            elif error_code == 4:
                retry_after = error_data.get("error_subcode")
                raise RateLimitError(
                    f"{provider} rate limit exceeded: {error_message}",
                    retry_after=retry_after,
                )

    raise ProviderAPIError(
        f"{provider} API error ({response.status_code}): {error_message}",
        retryable=retryable,
        error_code=error_code,
    )


def _normalize_media(media_assets: Optional[Iterable[MediaAsset]]) -> List[MediaAsset]:
    """Normalize media assets to list."""
    return list(media_assets or [])


def _download_media(media: MediaAsset) -> bytes:
    """Download media from URL."""
    response = requests.get(media.file_url, timeout=120)
    if not response.ok:
        _raise_provider_error("media-download", response)
    return response.content


def poll_video_status(
    ig_user_id: str,
    creation_id: str,
    access_token: str,
    max_attempts: int = 10,
    base_delay: float = 2.0,
) -> str:
    """
    Poll Instagram/Facebook video upload status until finished or failed.

    Uses exponential backoff retry strategy.

    Args:
        ig_user_id: Instagram user ID or Facebook page ID
        creation_id: Media creation ID to poll
        access_token: Valid access token
        max_attempts: Maximum polling attempts
        base_delay: Base delay in seconds for exponential backoff

    Returns:
        "FINISHED" if successful

    Raises:
        ProviderAPIError: If video processing fails or times out
    """
    for attempt in range(max_attempts):
        try:
            status_response = requests.get(
                f"https://graph.facebook.com/v18.0/{creation_id}",
                params={
                    "fields": "status_code",
                    "access_token": access_token,
                },
                timeout=30,
            )
            if not status_response.ok:
                _raise_provider_error("video-status-check", status_response)

            status_data = status_response.json()
            status_code = status_data.get("status_code", "").upper()

            if status_code in ("FINISHED", "SUCCESS"):
                logger.info(f"Video processing finished: {creation_id}")
                return "FINISHED"
            elif status_code in ("ERROR", "FAILED"):
                error_msg = status_data.get("error_message", "Unknown error")
                raise ProviderAPIError(
                    f"Video processing failed: {error_msg}",
                    retryable=False,
                )
            elif status_code in ("IN_PROGRESS", "PROCESSING"):
                logger.info(
                    f"Video processing in progress: {creation_id} "
                    f"(attempt {attempt + 1}/{max_attempts})"
                )
            else:
                logger.warning(
                    f"Unknown video status '{status_code}' for {creation_id}"
                )

            # Exponential backoff
            if attempt < max_attempts - 1:
                delay = base_delay * (2**attempt)
                logger.info(f"Waiting {delay}s before next status check...")
                time.sleep(delay)

        except requests.RequestException as e:
            logger.warning(f"Network error during status polling (attempt {attempt + 1}): {e}")
            if attempt < max_attempts - 1:
                delay = base_delay * (2**attempt)
                time.sleep(delay)
            else:
                raise ProviderAPIError(
                    f"Failed to poll video status after {max_attempts} attempts: {e}",
                    retryable=True,
                )

    raise ProviderAPIError(
        f"Video processing timeout after {max_attempts} attempts for {creation_id}",
        retryable=True,
    )


def generate_post_hash(text: str, media_urls: List[str]) -> str:
    """
    Generate SHA256 hash for duplicate post detection.

    Args:
        text: Post caption/content
        media_urls: List of media URLs (will be sorted for consistency)

    Returns:
        SHA256 hash string
    """
    sorted_urls = sorted(media_urls)
    content = f"{text}|{','.join(sorted_urls)}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def check_duplicate_post(post_hash: str, platform: str, ttl_seconds: int = 600) -> bool:
    """
    Check if post was already published within time window.

    Args:
        post_hash: SHA256 hash of post content
        platform: Platform name
        ttl_seconds: Time-to-live in Redis (default 10 minutes)

    Returns:
        True if duplicate detected

    Raises:
        DuplicatePostError: If duplicate post found
    """
    redis_key = f"socialsync:post_hash:{platform}:{post_hash}"

    if redis_client.exists(redis_key):
        logger.warning(f"Duplicate post detected: {post_hash[:16]}...")
        raise DuplicatePostError(
            f"Similar post already published to {platform} within last {ttl_seconds // 60} minutes"
        )

    return False


def mark_post_published(post_hash: str, platform: str, ttl_seconds: int = 600) -> None:
    """
    Mark post as published in Redis to prevent duplicates.

    Args:
        post_hash: SHA256 hash of post content
        platform: Platform name
        ttl_seconds: Time-to-live in seconds
    """
    redis_key = f"socialsync:post_hash:{platform}:{post_hash}"
    redis_client.setex(redis_key, ttl_seconds, "published")
    logger.info(f"Marked post as published: {post_hash[:16]}... (TTL: {ttl_seconds}s)")


def log_publish_event(
    platform: str,
    status: str,
    media_count: int = 0,
    error: Optional[str] = None,
    post_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Log structured JSON publish event.

    Args:
        platform: Platform name (facebook, instagram, etc.)
        status: "success" or "failure"
        media_count: Number of media items
        error: Error message if failed
        post_id: Published post ID if successful
        extra: Additional context fields
    """
    log_data = {
        "platform": platform,
        "status": status,
        "media_count": media_count,
        "error": error,
        "post_id": post_id,
    }
    if extra:
        log_data.update(extra)

    if status == "success":
        logger.info(json.dumps(log_data))
    else:
        logger.error(json.dumps(log_data))


# ============================================================================
# LEGACY HELPER FUNCTIONS (for other platforms)
# ============================================================================


# ============================================================================
# BASE PUBLISHER CLASS
# ============================================================================


class BasePublisher(ABC):
    """Abstract base class for platform publishers."""

    def __init__(self, platform: str):
        self.platform = platform

    @abstractmethod
    def validate_media(self, media_assets: List[MediaAsset]) -> None:
        """Validate media assets for platform-specific requirements."""
        pass

    @abstractmethod
    def publish(
        self,
        post: ScheduledPost,
        account: SocialAccount,
        access_token: str,
        options: Dict[str, Any],
        media_assets: List[MediaAsset],
    ) -> str:
        """Publish content to platform. Returns post ID."""
        pass

    def check_duplicate(self, text: str, media_assets: List[MediaAsset]) -> None:
        """Check for duplicate posts using content hash."""
        media_urls = [m.file_url for m in media_assets]
        post_hash = generate_post_hash(text, media_urls)
        check_duplicate_post(post_hash, self.platform)

    def mark_published(self, text: str, media_assets: List[MediaAsset]) -> str:
        """Mark post as published in Redis. Returns hash."""
        media_urls = [m.file_url for m in media_assets]
        post_hash = generate_post_hash(text, media_urls)
        mark_post_published(post_hash, self.platform)
        return post_hash


# ============================================================================
# FACEBOOK PUBLISHER
# ============================================================================


def _linkedin_headers(access_token: str, *, content_type: str = "application/json") -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": content_type,
        "Linkedin-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }


def _linkedin_author_urn(account: SocialAccount) -> str:
    account_type = getattr(account, "account_type", None) or ""
    owner_prefix = "organization" if account_type.lower() == "organization" else "person"
    return f"urn:li:{owner_prefix}:{account.platform_account_id}"


def _twitter_json_headers(access_token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def _refresh_google_access_token(account: SocialAccount) -> str:
    if not account.encrypted_refresh_token:
        raise PublishError(
            "YouTube account is missing a refresh token. Reconnect the YouTube account and try again.",
            retryable=False,
        )

    refresh_token = decrypt_token(account.encrypted_refresh_token)
    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    if not token_response.ok:
        _raise_provider_error("google-refresh", token_response, retryable=False)

    token_payload = token_response.json()
    access_token = token_payload.get("access_token")
    if not access_token:
        raise PublishError("Google refresh response did not include an access token.", retryable=False)

    account.encrypted_token = encrypt_token(access_token)
    expires_in = token_payload.get("expires_in")
    if expires_in:
        account.token_expiry = datetime.utcnow() + timedelta(seconds=int(expires_in))

    return access_token


def _get_youtube_access_token(account: SocialAccount) -> str:
    token_expiry = getattr(account, "token_expiry", None)
    if token_expiry:
        if token_expiry.tzinfo is None:
            token_expiry = token_expiry.replace(tzinfo=timezone.utc)
        if token_expiry <= datetime.now(timezone.utc) + timedelta(minutes=1):
            return _refresh_google_access_token(account)
    return decrypt_token(account.encrypted_token)



def publish_to_provider(
    post: ScheduledPost,
    account: SocialAccount,
    media_assets: Optional[Iterable[MediaAsset]] = None,
) -> str:
    """
    Main entry point for publishing to any provider.

    Routes to appropriate platform publisher with retry logic for transient errors.

    Args:
        post: ScheduledPost object
        account: SocialAccount object
        media_assets: Optional list of MediaAsset objects

    Returns:
        Published post ID from platform

    Raises:
        ProviderAPIError: On API failures (may be retryable)
        MediaValidationError: On invalid media
        DuplicatePostError: On duplicate post detection
        UnsupportedPublishError: On unsupported platform
    """
    access_token = decrypt_token(account.encrypted_token)
    options = post.platform_options or {}
    normalized_media = _normalize_media(media_assets)

    # Route to platform-specific publisher
    if post.platform == "facebook":
        return _publish_with_retry(
            facebook_publisher.publish,
            post, account, access_token, options.get("facebook", {}), normalized_media,
        )
    if post.platform == "linkedin":
        return publish_to_linkedin(post, account, access_token, options.get("linkedin", {}), normalized_media)
    if post.platform == "twitter":
        return publish_to_twitter(post, account, access_token, options.get("twitter", {}), normalized_media)
    if post.platform == "instagram":
        return _publish_with_retry(
            instagram_publisher.publish,
            post, account, access_token, options.get("instagram", {}), normalized_media,
        )
    if post.platform == "youtube":
        youtube_access_token = _get_youtube_access_token(account)
        return publish_to_youtube(post, account, youtube_access_token, options.get("youtube", {}), normalized_media)
    if post.platform == "blogger":
        return publish_to_blogger(post, account, access_token, options.get("blogger", {}), normalized_media)
    if post.platform == "google_business":
        return publish_to_google_business(post, account, access_token, options.get("google_business", {}), normalized_media)
    if post.platform == "wordpress":
        return publish_to_wordpress(post, account, access_token, options.get("wordpress", {}), normalized_media)

    raise UnsupportedPublishError(f"Unsupported platform '{post.platform}'")


def _publish_with_retry(
    publish_func,
    post: ScheduledPost,
    account: SocialAccount,
    access_token: str,
    options: Dict[str, Any],
    media_assets: List[MediaAsset],
    max_retries: int = 3,
) -> str:
    """
    Wrapper for publishing with retry logic for transient errors.

    Only retries on:
    - RateLimitError
    - Retryable ProviderAPIError

    Does NOT retry on:
    - MediaValidationError
    - DuplicatePostError
    - TokenExpiredError
    - Non-retryable errors

    Args:
        publish_func: Platform publish function
        post: ScheduledPost object
        account: SocialAccount object
        access_token: Decrypted access token
        options: Platform-specific options
        media_assets: List of media assets
        max_retries: Maximum retry attempts

    Returns:
        Published post ID
    """
    last_error: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        try:
            return publish_func(post, account, access_token, options, media_assets)

        except RateLimitError as e:
            last_error = e
            retry_after = getattr(e, 'retry_after', None)
            wait_time = retry_after if retry_after else (2 ** attempt)

            logger.warning(
                f"Rate limit hit (attempt {attempt + 1}/{max_retries + 1}). "
                f"Waiting {wait_time}s before retry..."
            )

            if attempt < max_retries:
                time.sleep(wait_time)
            else:
                logger.error(f"Rate limit retry exhausted after {max_retries} attempts")
                raise

        except ProviderAPIError as e:
            if not e.retryable:
                logger.error(f"Non-retryable error: {e}")
                raise

            last_error = e
            wait_time = 2 ** attempt

            logger.warning(
                f"Retryable error (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                f"Waiting {wait_time}s before retry..."
            )

            if attempt < max_retries:
                time.sleep(wait_time)
            else:
                logger.error(f"Retry exhausted after {max_retries} attempts: {e}")
                raise

        except (MediaValidationError, DuplicatePostError, TokenExpiredError):
            # Never retry these errors
            raise

        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error during publish: {e}")
            raise

    # Should not reach here, but just in case
    if last_error:
        raise last_error
    raise ProviderAPIError("Publish failed after retries", retryable=False)


class FacebookPublisher(BasePublisher):
    """Facebook platform publisher with carousel and media validation."""

    def __init__(self):
        super().__init__("facebook")

    def validate_media(self, media_assets: List[MediaAsset]) -> None:
        """Validate media assets for Facebook."""
        if len(media_assets) > 1:
            # Multi-media: must be images only
            if any(m.file_type == "video" for m in media_assets):
                raise MediaValidationError(
                    "Facebook carousel supports images only (no video mixing)"
                )

        for idx, media in enumerate(media_assets):
            validate_media_for_platform(media, "facebook", idx)

    def publish(
        self,
        post: ScheduledPost,
        account: SocialAccount,
        access_token: str,
        options: Dict[str, Any],
        media_assets: List[MediaAsset],
    ) -> str:
        """Publish to Facebook with full validation and error handling."""
        content = post.content or ""

        try:
            # Validate media
            self.validate_media(media_assets)

            # Reel mode is only valid for a single video upload.
            if options.get("caption_mode") == "reel":
                if len(media_assets) != 1 or media_assets[0].file_type != "video":
                    raise MediaValidationError("Instagram Reel mode requires exactly one video asset.")

            # Check for duplicates
            self.check_duplicate(content, media_assets)

            # Route to appropriate publish method
            if not media_assets:
                post_id = self._publish_text_only(account, access_token, content, options)
            elif len(media_assets) == 1:
                post_id = self._publish_single_media(account, access_token, content, media_assets[0], options)
            else:
                post_id = self._publish_carousel(account, access_token, content, media_assets)

            # Mark as published
            self.mark_published(content, media_assets)

            log_publish_event(
                platform="facebook",
                status="success",
                media_count=len(media_assets),
                post_id=post_id,
            )

            return post_id

        except (MediaValidationError, DuplicatePostError, TokenExpiredError) as e:
            log_publish_event(
                platform="facebook",
                status="failure",
                media_count=len(media_assets),
                error=str(e),
            )
            raise
        except ProviderAPIError as e:
            log_publish_event(
                platform="facebook",
                status="failure",
                media_count=len(media_assets),
                error=str(e),
            )
            raise
        except Exception as e:
            log_publish_event(
                platform="facebook",
                status="failure",
                media_count=len(media_assets),
                error=f"Unexpected error: {str(e)}",
            )
            raise ProviderAPIError(f"Facebook publish failed: {str(e)}", retryable=True)

    def _publish_text_only(
        self,
        account: SocialAccount,
        access_token: str,
        content: str,
        options: Dict[str, Any],
    ) -> str:
        """Publish text-only post to Facebook."""
        if not content:
            raise MediaValidationError("Facebook post content is required")

        payload = {"message": content, "access_token": access_token}
        link = options.get("link")
        if link:
            payload["link"] = link

        response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/feed",
            data=payload,
            timeout=30,
        )
        if not response.ok:
            _raise_provider_error("facebook", response)
        return response.json().get("id") or account.platform_account_id

    def _publish_single_media(
        self,
        account: SocialAccount,
        access_token: str,
        content: str,
        media: MediaAsset,
        options: Dict[str, Any],
    ) -> str:
        """Publish single media post to Facebook."""
        if media.file_type == "image":
            return self._publish_single_image(account, access_token, content, media)
        elif media.file_type == "video":
            return self._publish_single_video(account, access_token, content, media, options)
        else:
            raise MediaValidationError(f"Unsupported media type: {media.file_type}")

    def _publish_single_image(
        self,
        account: SocialAccount,
        access_token: str,
        content: str,
        media: MediaAsset,
    ) -> str:
        """Publish single image to Facebook."""
        response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/photos",
            data={
                "url": media.file_url,
                "caption": content,
                "access_token": access_token,
            },
            timeout=60,
        )
        if not response.ok:
            _raise_provider_error("facebook", response)
        return response.json().get("post_id") or response.json().get("id") or account.platform_account_id

    def _publish_single_video(
        self,
        account: SocialAccount,
        access_token: str,
        content: str,
        media: MediaAsset,
        options: Dict[str, Any],
    ) -> str:
        """Publish single video to Facebook with status polling."""
        response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/videos",
            data={
                "file_url": media.file_url,
                "description": content,
                "title": options.get("title") or "Scheduled video",
                "access_token": access_token,
            },
            timeout=120,
        )
        if not response.ok:
            _raise_provider_error("facebook", response)

        video_id = response.json().get("id")
        if not video_id:
            raise ProviderAPIError("Facebook video upload did not return video ID", retryable=False)

        # Poll for video processing status
        try:
            poll_video_status(
                ig_user_id=account.platform_account_id,
                creation_id=video_id,
                access_token=access_token,
                max_attempts=10,
                base_delay=3.0,
            )
        except ProviderAPIError as e:
            logger.warning(f"Facebook video polling warning: {e}")
            # Don't fail the publish if polling fails, video may still process

        return video_id or account.platform_account_id

    def _publish_carousel(
        self,
        account: SocialAccount,
        access_token: str,
        content: str,
        media_assets: List[MediaAsset],
    ) -> str:
        """Publish carousel (multi-image) post to Facebook."""
        uploaded_media_ids: List[str] = []

        # Upload all images as unpublished
        for idx, media in enumerate(media_assets):
            response = requests.post(
                f"https://graph.facebook.com/v18.0/{account.platform_account_id}/photos",
                data={
                    "url": media.file_url,
                    "published": "false",
                    "access_token": access_token,
                },
                timeout=60,
            )
            if not response.ok:
                _raise_provider_error("facebook", response)
            media_id = response.json().get("id")
            if not media_id:
                raise ProviderAPIError(
                    f"Facebook image {idx} upload did not return media ID",
                    retryable=False,
                )
            uploaded_media_ids.append(media_id)

        # Create carousel post with attached media
        feed_payload: Dict[str, Any] = {"access_token": access_token, "message": content}
        for index, media_id in enumerate(uploaded_media_ids):
            feed_payload[f"attached_media[{index}]"] = json.dumps({"media_fbid": media_id})

        response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/feed",
            data=feed_payload,
            timeout=60,
        )
        if not response.ok:
            _raise_provider_error("facebook", response)
        return response.json().get("id") or account.platform_account_id


def _linkedin_upload_image(access_token: str, author_urn: str, media: MediaAsset) -> str:
    init_response = requests.post(
        "https://api.linkedin.com/rest/images?action=initializeUpload",
        headers=_linkedin_headers(access_token),
        json={"initializeUploadRequest": {"owner": author_urn}},
        timeout=60,
    )
    if not init_response.ok:
        _raise_provider_error("linkedin", init_response)

    init_payload = init_response.json().get("value", {})
    upload_url = init_payload.get("uploadUrl")
    image_urn = init_payload.get("image")
    if not upload_url or not image_urn:
        raise PublishError("LinkedIn image upload initialization did not return upload details.", retryable=False)

    upload_response = requests.put(
        upload_url,
        headers={"Content-Type": media.mime_type or "application/octet-stream"},
        data=_download_media(media),
        timeout=180,
    )
    if not upload_response.ok:
        _raise_provider_error("linkedin-image-upload", upload_response)

    return image_urn


def _linkedin_upload_video(access_token: str, author_urn: str, media: MediaAsset) -> str:
    video_bytes = _download_media(media)
    init_response = requests.post(
        "https://api.linkedin.com/rest/videos?action=initializeUpload",
        headers=_linkedin_headers(access_token),
        json={
            "initializeUploadRequest": {
                "owner": author_urn,
                "fileSizeBytes": len(video_bytes),
                "uploadCaptions": False,
                "uploadThumbnail": False,
            }
        },
        timeout=60,
    )
    if not init_response.ok:
        _raise_provider_error("linkedin", init_response)

    init_payload = init_response.json().get("value", {})
    video_urn = init_payload.get("video")
    upload_instructions = init_payload.get("uploadInstructions") or []
    upload_token = init_payload.get("uploadToken", "")
    if not video_urn or not upload_instructions:
        raise PublishError("LinkedIn video upload initialization did not return upload instructions.", retryable=False)

    uploaded_part_ids: List[str] = []
    for instruction in upload_instructions:
        upload_url = instruction.get("uploadUrl")
        first_byte = instruction.get("firstByte")
        last_byte = instruction.get("lastByte")
        if upload_url is None or first_byte is None or last_byte is None:
            raise PublishError("LinkedIn video upload instruction was incomplete.", retryable=False)

        chunk = video_bytes[int(first_byte) : int(last_byte) + 1]
        upload_response = requests.put(
            upload_url,
            headers={"Content-Type": "application/octet-stream"},
            data=chunk,
            timeout=600,
        )
        if not upload_response.ok:
            _raise_provider_error("linkedin-video-upload", upload_response)

        etag = upload_response.headers.get("etag") or upload_response.headers.get("ETag")
        if not etag:
            raise PublishError("LinkedIn video upload did not return an ETag for finalize step.", retryable=False)
        uploaded_part_ids.append(etag.strip('"'))

    finalize_response = requests.post(
        "https://api.linkedin.com/rest/videos?action=finalizeUpload",
        headers=_linkedin_headers(access_token),
        json={
            "finalizeUploadRequest": {
                "video": video_urn,
                "uploadToken": upload_token,
                "uploadedPartIds": uploaded_part_ids,
            }
        },
        timeout=60,
    )
    if not finalize_response.ok:
        _raise_provider_error("linkedin-video-finalize", finalize_response)

    for _ in range(10):
        status_response = requests.get(
            f"https://api.linkedin.com/rest/videos/{quote(video_urn, safe='')}",
            headers=_linkedin_headers(access_token),
            timeout=30,
        )
        if not status_response.ok:
            _raise_provider_error("linkedin-video-status", status_response)

        status = (status_response.json().get("status") or "").upper()
        if status == "AVAILABLE":
            return video_urn
        if status in {"PROCESSING_FAILED", "FAILED"}:
            raise PublishError("LinkedIn video processing failed after upload.", retryable=False)
        time.sleep(3)

    raise PublishError("LinkedIn video is still processing. Try publishing again shortly.", retryable=True)


def _twitter_upload_images(access_token: str, media_assets: List[MediaAsset]) -> List[str]:
    media_ids: List[str] = []
    for media in media_assets:
        payload = {
            "media_category": "tweet_image",
            "media_type": getattr(media, "mime_type", None) or "image/jpeg",
            "shared": "false",
        }
        upload_response = requests.post(
            "https://api.x.com/2/media/upload",
            headers={"Authorization": f"Bearer {access_token}"},
            data=payload,
            files={"media": ("upload", _download_media(media), getattr(media, "mime_type", None) or "application/octet-stream")},
            timeout=120,
        )
        if not upload_response.ok:
            _raise_provider_error("twitter-media", upload_response)
        media_id = upload_response.json().get("data", {}).get("id")
        if not media_id:
            raise PublishError("Twitter image upload did not return a media id.", retryable=False)
        media_ids.append(str(media_id))
    return media_ids


def _twitter_wait_for_media(access_token: str, media_id: str) -> None:
    for _ in range(12):
        status_response = requests.get(
            "https://api.x.com/2/media/upload",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"media_id": media_id, "command": "STATUS"},
            timeout=30,
        )
        if not status_response.ok:
            _raise_provider_error("twitter-media-status", status_response)
        processing = status_response.json().get("data", {}).get("processing_info") or {}
        state = processing.get("state")
        if not state or state == "succeeded":
            return
        if state == "failed":
            raise PublishError(f"Twitter media processing failed: {processing}", retryable=False)
        time.sleep(processing.get("check_after_secs", 2))

    raise PublishError("Twitter media is still processing. Try again shortly.", retryable=True)


def _twitter_upload_video(access_token: str, media: MediaAsset) -> str:
    video_bytes = _download_media(media)
    init_response = requests.post(
        "https://api.x.com/2/media/upload/initialize",
        headers=_twitter_json_headers(access_token),
        json={
            "media_category": "tweet_video",
            "media_type": getattr(media, "mime_type", None) or "video/mp4",
            "shared": False,
            "total_bytes": len(video_bytes),
        },
        timeout=60,
    )
    if not init_response.ok:
        _raise_provider_error("twitter-media-initialize", init_response)

    media_id = init_response.json().get("data", {}).get("id")
    if not media_id:
        raise PublishError("Twitter video upload did not return a media id.", retryable=False)

    media_id_str = str(media_id)
    for index, start in enumerate(range(0, len(video_bytes), TWITTER_MEDIA_CHUNK_SIZE)):
        chunk = video_bytes[start : start + TWITTER_MEDIA_CHUNK_SIZE]
        append_response = requests.post(
            f"https://api.x.com/2/media/upload/{media_id_str}/append",
            headers={"Authorization": f"Bearer {access_token}"},
            data={"segment_index": str(index)},
            files={"media": ("chunk", chunk, getattr(media, "mime_type", None) or "application/octet-stream")},
            timeout=180,
        )
        if not append_response.ok:
            _raise_provider_error("twitter-media-append", append_response)

    finalize_response = requests.post(
        f"https://api.x.com/2/media/upload/{media_id_str}/finalize",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=60,
    )
    if not finalize_response.ok:
        _raise_provider_error("twitter-media-finalize", finalize_response)

    _twitter_wait_for_media(access_token, media_id_str)
    return media_id_str


def publish_to_linkedin(
    post: ScheduledPost,
    account: SocialAccount,
    access_token: str,
    options: Dict[str, Any],
    media_assets: List[MediaAsset],
) -> str:
    if len(media_assets) > 1:
        raise UnsupportedPublishError("LinkedIn publishing currently supports one image or one video per post.")

    if not post.content and not media_assets:
        raise PublishError("LinkedIn post content is required when no media is attached", retryable=False)

    author_urn = _linkedin_author_urn(account)
    visibility = options.get("visibility", "PUBLIC")
    payload = {
        "author": author_urn,
        "commentary": post.content or "",
        "visibility": visibility,
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if media_assets:
        media = media_assets[0]
        media_content: Dict[str, Any]
        if media.file_type == "image":
            image_urn = _linkedin_upload_image(access_token, author_urn, media)
            media_content = {"id": image_urn}
            if media.alt_text:
                media_content["altText"] = media.alt_text
        elif media.file_type == "video":
            video_urn = _linkedin_upload_video(access_token, author_urn, media)
            media_content = {
                "id": video_urn,
                "title": options.get("title") or media.alt_text or "LinkedIn video",
            }
        else:
            raise UnsupportedPublishError("LinkedIn publishing currently supports image and video assets only.")
        payload["content"] = {"media": media_content}

    response = requests.post(
        "https://api.linkedin.com/rest/posts",
        headers=_linkedin_headers(access_token),
        json=payload,
        timeout=60,
    )
    if not response.ok:
        _raise_provider_error("linkedin", response)

    return response.headers.get("x-restli-id") or response.json().get("id") or account.platform_account_id


def publish_to_twitter(
    post: ScheduledPost,
    account: SocialAccount,
    access_token: str,
    options: Dict[str, Any],
    media_assets: List[MediaAsset],
) -> str:
    if not post.content and not media_assets:
        raise PublishError("Twitter post text or media is required", retryable=False)

    payload: Dict[str, Any] = {}
    if post.content:
        payload["text"] = post.content
    reply_settings = options.get("reply_settings")
    if reply_settings:
        payload["reply_settings"] = reply_settings

    if media_assets:
        if len(media_assets) > 4:
            raise UnsupportedPublishError("Twitter supports up to 4 images or 1 video per post.")
        if len(media_assets) == 1 and media_assets[0].file_type == "video":
            media_ids = [_twitter_upload_video(access_token, media_assets[0])]
        elif all(media.file_type == "image" for media in media_assets):
            media_ids = _twitter_upload_images(access_token, media_assets)
        else:
            raise UnsupportedPublishError("Twitter publishing supports either up to 4 images or a single video.")
        payload["media"] = {"media_ids": media_ids}

    response = requests.post(
        "https://api.twitter.com/2/tweets",
        headers=_twitter_json_headers(access_token),
        json=payload,
        timeout=30,
    )
    if not response.ok:
        _raise_provider_error("twitter", response)

    data = response.json().get("data", {})
    return data.get("id") or account.platform_account_id


def _derive_text_post_title(post: ScheduledPost, options: Dict[str, Any], fallback: str) -> str:
    explicit_title = options.get("title")
    if isinstance(explicit_title, str) and explicit_title.strip():
        return explicit_title.strip()

    content = (post.content or "").strip()
    if not content:
        return fallback

    first_line = content.splitlines()[0].strip()
    return first_line[:80] if first_line else fallback


def _html_content_from_post(post: ScheduledPost) -> str:
    content = (post.content or "").strip()
    if not content:
        return ""
    paragraphs = [segment.strip() for segment in content.splitlines() if segment.strip()]
    if not paragraphs:
        return ""
    return "".join(f"<p>{html.escape(paragraph)}</p>" for paragraph in paragraphs)


def _blogger_html_content(post: ScheduledPost, media_assets: List[MediaAsset]) -> str:
    content_html = _html_content_from_post(post)
    media_html_parts: List[str] = []
    for media in media_assets:
        media_url = (media.file_url or "").strip()
        if not media_url:
            continue
        alt_text = html.escape(media.alt_text or "")
        if media.file_type == "image":
            media_html_parts.append(
                f'<figure><img src="{html.escape(media_url)}" alt="{alt_text}" loading="lazy" /></figure>'
            )
        elif media.file_type == "video":
            media_html_parts.append(
                (
                    "<figure>"
                    f'<video controls preload="metadata" style="max-width:100%;">'
                    f'<source src="{html.escape(media_url)}" type="{html.escape(media.mime_type or "video/mp4")}" />'
                    "Your browser does not support the video tag."
                    "</video>"
                    "</figure>"
                )
            )
    media_html = "".join(media_html_parts)
    return f"{content_html}{media_html}" if media_html else content_html


def _wordpress_html_content(post: ScheduledPost, media_assets: List[MediaAsset]) -> str:
    content_html = _html_content_from_post(post)
    media_html_parts: List[str] = []
    for media in media_assets:
        media_url = (media.file_url or "").strip()
        if not media_url:
            continue
        alt_text = html.escape(media.alt_text or "")
        if media.file_type == "image":
            media_html_parts.append(
                f'<figure><img src="{html.escape(media_url)}" alt="{alt_text}" loading="lazy" /></figure>'
            )
        elif media.file_type == "video":
            media_html_parts.append(
                (
                    "<figure>"
                    f'<video controls preload="metadata" style="max-width:100%;">'
                    f'<source src="{html.escape(media_url)}" type="{html.escape(media.mime_type or "video/mp4")}" />'
                    "Your browser does not support the video tag."
                    "</video>"
                    "</figure>"
                )
            )
        else:
            raise UnsupportedPublishError("WordPress supports image and video assets only.")
    media_html = "".join(media_html_parts)
    return f"{content_html}{media_html}" if media_html else content_html


def _wordpress_account_details(account: SocialAccount) -> Tuple[str, str]:
    site_url, separator, username = (account.platform_account_id or "").partition("|")
    if not separator or not site_url or not username:
        raise PublishError(
            "WordPress account metadata is incomplete. Reconnect the WordPress site and try again.",
            retryable=False,
        )
    return site_url.rstrip("/"), username


def publish_to_blogger(
    post: ScheduledPost,
    account: SocialAccount,
    access_token: str,
    options: Dict[str, Any],
    media_assets: List[MediaAsset],
) -> str:
    if not post.content and not media_assets:
        raise PublishError("Blogger post requires text or media content.", retryable=False)

    title = _derive_text_post_title(post, options, "New Blogger Post")
    response = requests.post(
        f"https://www.googleapis.com/blogger/v3/blogs/{quote(account.platform_account_id, safe='')}/posts",
        headers=_twitter_json_headers(access_token),
        params={"isDraft": "false"},
        json={
            "title": title,
            "content": _blogger_html_content(post, media_assets),
            "labels": options.get("labels") or [],
        },
        timeout=60,
    )
    if not response.ok:
        _raise_provider_error("blogger", response)

    payload = response.json()
    return payload.get("url") or str(payload.get("id") or account.platform_account_id)


def publish_to_google_business(
    post: ScheduledPost,
    account: SocialAccount,
    access_token: str,
    options: Dict[str, Any],
    media_assets: List[MediaAsset],
) -> str:
    if not post.content and not media_assets:
        raise PublishError("Google Business post requires text or media content.", retryable=False)
    if len(media_assets) > 1:
        raise UnsupportedPublishError("Google Business currently supports one image or one video per local post.")

    payload: Dict[str, Any] = {
        "languageCode": options.get("languageCode") or "en-US",
        "summary": post.content.strip(),
        "topicType": options.get("topicType") or "STANDARD",
    }
    call_to_action_url = options.get("callToActionUrl")
    if call_to_action_url:
        payload["callToAction"] = {
            "actionType": options.get("actionType") or "LEARN_MORE",
            "url": call_to_action_url,
        }
    if media_assets:
        media = media_assets[0]
        if media.file_type not in {"image", "video"}:
            raise UnsupportedPublishError("Google Business supports image or video media only.")
        payload["media"] = [
            {
                "mediaFormat": "PHOTO" if media.file_type == "image" else "VIDEO",
                "sourceUrl": media.file_url,
            }
        ]

    response = requests.post(
        f"https://mybusiness.googleapis.com/v4/{account.platform_account_id}/localPosts",
        headers=_twitter_json_headers(access_token),
        json=payload,
        timeout=60,
    )
    if not response.ok:
        _raise_provider_error("google_business", response)

    return response.json().get("name") or account.platform_account_id


def publish_to_wordpress(
    post: ScheduledPost,
    account: SocialAccount,
    access_token: str,
    options: Dict[str, Any],
    media_assets: List[MediaAsset],
) -> str:
    if not post.content and not media_assets:
        raise PublishError("WordPress post requires text or media content.", retryable=False)
    if any(media.file_type not in {"image", "video"} for media in media_assets):
        raise UnsupportedPublishError("WordPress supports image and video assets only.")

    site_url, username = _wordpress_account_details(account)
    title = _derive_text_post_title(post, options, "New WordPress Post")
    response = requests.post(
        f"{site_url}/wp-json/wp/v2/posts",
        auth=(username, access_token),
        json={
            "title": title,
            "content": _wordpress_html_content(post, media_assets),
            "status": options.get("status") or "publish",
            "excerpt": options.get("excerpt") or "",
        },
        timeout=60,
    )
    if response.status_code in {401, 403}:
        raise PublishError(
            "WordPress authentication failed. Reconnect the WordPress site application password and try again.",
            retryable=False,
        )
    if not response.ok:
        _raise_provider_error("wordpress", response)

    payload = response.json()
    return payload.get("link") or str(payload.get("id") or account.platform_account_id)


class InstagramPublisher(BasePublisher):
    """Instagram platform publisher with carousel and media validation."""

    def __init__(self):
        super().__init__("instagram")

    def validate_media(self, media_assets: List[MediaAsset]) -> None:
        """Validate media assets for Instagram."""
        if not media_assets:
            raise MediaValidationError("Instagram requires at least one media asset")

        if len(media_assets) > 10:
            raise MediaValidationError(
                f"Instagram supports maximum 10 media items, got {len(media_assets)}"
            )

        # Carousel must be same type
        if len(media_assets) > 1:
            types = set(m.file_type for m in media_assets)
            if len(types) > 1:
                raise MediaValidationError(
                    f"Instagram carousel must contain same media type, got: {', '.join(types)}"
                )

        for idx, media in enumerate(media_assets):
            validate_media_for_platform(media, "instagram", idx)

    def publish(
        self,
        post: ScheduledPost,
        account: SocialAccount,
        access_token: str,
        options: Dict[str, Any],
        media_assets: List[MediaAsset],
    ) -> str:
        """Publish to Instagram with full validation and error handling."""
        content = post.content or ""

        try:
            # Validate media
            self.validate_media(media_assets)

            # Check for duplicates
            self.check_duplicate(content, media_assets)

            # Route to appropriate publish method
            if len(media_assets) == 1:
                post_id = self._publish_single_media(
                    account, access_token, content, media_assets[0], options
                )
            else:
                post_id = self._publish_carousel(
                    account, access_token, content, media_assets, options
                )

            # Mark as published
            self.mark_published(content, media_assets)

            log_publish_event(
                platform="instagram",
                status="success",
                media_count=len(media_assets),
                post_id=post_id,
            )

            return post_id

        except (MediaValidationError, DuplicatePostError, TokenExpiredError) as e:
            log_publish_event(
                platform="instagram",
                status="failure",
                media_count=len(media_assets),
                error=str(e),
            )
            raise
        except ProviderAPIError as e:
            log_publish_event(
                platform="instagram",
                status="failure",
                media_count=len(media_assets),
                error=str(e),
            )
            raise
        except Exception as e:
            log_publish_event(
                platform="instagram",
                status="failure",
                media_count=len(media_assets),
                error=f"Unexpected error: {str(e)}",
            )
            raise ProviderAPIError(f"Instagram publish failed: {str(e)}", retryable=True)

    def _publish_single_media(
        self,
        account: SocialAccount,
        access_token: str,
        content: str,
        media: MediaAsset,
        options: Dict[str, Any],
    ) -> str:
        """Publish single media (image or video) to Instagram."""
        creation_payload: Dict[str, Any] = {
            "caption": content,
            "access_token": access_token,
        }

        if media.file_type == "image":
            creation_payload["image_url"] = media.file_url
        elif media.file_type == "video":
            creation_payload["video_url"] = media.file_url
            creation_payload["media_type"] = "REELS"
        else:
            raise MediaValidationError(f"Unsupported media type: {media.file_type}")

        # Override with caption mode if specified
        if options.get("caption_mode") == "reel":
            creation_payload["media_type"] = "REELS"

        # Step 1: Create media container
        create_response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/media",
            data=creation_payload,
            timeout=60,
        )
        if not create_response.ok:
            _raise_provider_error("instagram", create_response)

        creation_id = create_response.json().get("id")
        if not creation_id:
            raise ProviderAPIError(
                "Instagram media container creation did not return ID",
                retryable=False,
            )

        # Step 2: For video, poll until processing complete
        if media.file_type == "video":
            logger.info(f"Polling Instagram video status for {creation_id}...")
            poll_video_status(
                ig_user_id=account.platform_account_id,
                creation_id=creation_id,
                access_token=access_token,
                max_attempts=10,
                base_delay=3.0,
            )

        # Step 3: Publish the media
        publish_response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/media_publish",
            data={"creation_id": creation_id, "access_token": access_token},
            timeout=60,
        )
        if not publish_response.ok:
            _raise_provider_error("instagram", publish_response)

        published_id = publish_response.json().get("id") or creation_id

        # Optional: Add first comment
        first_comment = options.get("first_comment")
        if first_comment:
            self._add_first_comment(published_id, first_comment, access_token)

        return published_id

    def _publish_carousel(
        self,
        account: SocialAccount,
        access_token: str,
        content: str,
        media_assets: List[MediaAsset],
        options: Dict[str, Any],
    ) -> str:
        """
        Publish carousel post to Instagram (2-10 media items).

        Flow:
        1. Create media container for each item (get creation_id)
        2. For videos, poll until processing complete
        3. Create carousel container with all creation_ids
        4. Publish carousel
        """
        if len(media_assets) < 2:
            raise MediaValidationError("Carousel requires at least 2 media items")
        if len(media_assets) > 10:
            raise MediaValidationError("Instagram carousel supports maximum 10 items")

        # Validate all media are same type
        media_type = media_assets[0].file_type
        if any(m.file_type != media_type for m in media_assets):
            raise MediaValidationError(
                f"All carousel items must be same type, got mixed types"
            )

        # Step 1: Create media containers for each item
        creation_ids: List[str] = []
        for idx, media in enumerate(media_assets):
            child_payload: Dict[str, Any] = {"access_token": access_token}

            if media.file_type == "image":
                child_payload["image_url"] = media.file_url
                child_payload["is_carousel_item"] = "true"
            elif media.file_type == "video":
                child_payload["video_url"] = media.file_url
                child_payload["media_type"] = "REELS"
                child_payload["is_carousel_item"] = "true"
            else:
                raise MediaValidationError(f"Unsupported carousel media type: {media.file_type}")

            logger.info(f"Creating Instagram carousel item {idx + 1}/{len(media_assets)}...")
            create_response = requests.post(
                f"https://graph.facebook.com/v18.0/{account.platform_account_id}/media",
                data=child_payload,
                timeout=60,
            )
            if not create_response.ok:
                _raise_provider_error("instagram", create_response)

            creation_id = create_response.json().get("id")
            if not creation_id:
                raise ProviderAPIError(
                    f"Instagram carousel item {idx} creation did not return ID",
                    retryable=False,
                )
            creation_ids.append(creation_id)
            logger.info(f"Created carousel item {idx + 1}: {creation_id}")

        # Step 2: For video carousels, poll all videos until processing complete
        if media_type == "video":
            logger.info(f"Polling status for {len(creation_ids)} carousel videos...")
            for idx, creation_id in enumerate(creation_ids):
                logger.info(f"Polling video {idx + 1}/{len(creation_ids)}: {creation_id}")
                poll_video_status(
                    ig_user_id=account.platform_account_id,
                    creation_id=creation_id,
                    access_token=access_token,
                    max_attempts=10,
                    base_delay=3.0,
                )

        # Step 3: Create carousel container
        carousel_payload: Dict[str, Any] = {
            "media_type": "CAROUSEL",
            "children": ",".join(creation_ids),  # Meta API expects comma-separated string
            "caption": content,
            "access_token": access_token,
        }

        logger.info(f"Creating Instagram carousel container with {len(creation_ids)} items...")
        carousel_response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/media",
            data=carousel_payload,
            timeout=60,
        )
        if not carousel_response.ok:
            _raise_provider_error("instagram-carousel", carousel_response)

        carousel_id = carousel_response.json().get("id")
        if not carousel_id:
            raise ProviderAPIError(
                "Instagram carousel container creation did not return ID",
                retryable=False,
            )

        logger.info(f"Carousel container created: {carousel_id}")

        # Step 4: Publish carousel
        publish_response = requests.post(
            f"https://graph.facebook.com/v18.0/{account.platform_account_id}/media_publish",
            data={"creation_id": carousel_id, "access_token": access_token},
            timeout=60,
        )
        if not publish_response.ok:
            _raise_provider_error("instagram-carousel-publish", publish_response)

        published_id = publish_response.json().get("id") or carousel_id

        # Optional: Add first comment
        first_comment = options.get("first_comment")
        if first_comment:
            self._add_first_comment(published_id, first_comment, access_token)

        logger.info(f"Instagram carousel published successfully: {published_id}")
        return published_id

    def _add_first_comment(
        self,
        media_id: str,
        comment: str,
        access_token: str,
    ) -> None:
        """Add first comment to published media."""
        try:
            comment_response = requests.post(
                f"https://graph.facebook.com/v18.0/{media_id}/comments",
                data={"message": comment, "access_token": access_token},
                timeout=30,
            )
            if not comment_response.ok:
                logger.warning(
                    f"Instagram first comment failed for media_id={media_id}: "
                    f"{comment_response.status_code}"
                )
            else:
                logger.info(f"Added first comment to media {media_id}")
        except Exception as e:
            logger.warning(f"Failed to add first comment to {media_id}: {e}")


def publish_to_youtube(
    post: ScheduledPost,
    account: SocialAccount,
    access_token: str,
    options: Dict[str, Any],
    media_assets: List[MediaAsset],
) -> str:
    if options.get("publishAt"):
        raise UnsupportedPublishError("Use SocialSync scheduling for YouTube posts instead of native YouTube scheduling.")

    if len(media_assets) != 1 or media_assets[0].file_type != "video":
        raise UnsupportedPublishError("YouTube publishing currently requires exactly one video asset.")

    media = media_assets[0]
    video_bytes = _download_media(media)
    title = options.get("title")
    if not title or not str(title).strip():
        raise PublishError("YouTube video title is required", retryable=False)

    privacy_status = options.get("privacyStatus", "private")
    if privacy_status not in {"private", "public", "unlisted"}:
        raise PublishError("YouTube privacyStatus must be one of: private, public, unlisted", retryable=False)

    tags = options.get("tags") or []
    if not isinstance(tags, list) or any(not isinstance(tag, str) or not tag.strip() for tag in tags):
        raise PublishError("YouTube tags must be a list of non-empty strings", retryable=False)

    snippet = {
        "title": str(title).strip(),
        "description": options.get("description") or post.content or "",
        "tags": tags,
    }
    if options.get("categoryId"):
        snippet["categoryId"] = str(options["categoryId"])
    if options.get("defaultLanguage"):
        snippet["defaultLanguage"] = str(options["defaultLanguage"])

    status_payload: Dict[str, Any] = {"privacyStatus": privacy_status}
    if "madeForKids" in options:
        status_payload["selfDeclaredMadeForKids"] = bool(options["madeForKids"])
    if "embeddable" in options:
        status_payload["embeddable"] = bool(options["embeddable"])
    if options.get("license"):
        status_payload["license"] = str(options["license"])
    if "publicStatsViewable" in options:
        status_payload["publicStatsViewable"] = bool(options["publicStatsViewable"])

    notify_subscribers = options.get("notifySubscribers")
    notify_query = ""
    if notify_subscribers is not None:
        notify_query = f"&notifySubscribers={'true' if notify_subscribers else 'false'}"

    init_response = requests.post(
        f"https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status{notify_query}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": media.mime_type or "video/*",
            "X-Upload-Content-Length": str(len(video_bytes)),
        },
        json={"snippet": snippet, "status": status_payload},
        timeout=60,
    )
    if init_response.status_code == 401:
        refreshed_access_token = _refresh_google_access_token(account)
        init_response = requests.post(
            f"https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status{notify_query}",
            headers={
                "Authorization": f"Bearer {refreshed_access_token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": media.mime_type or "video/*",
                "X-Upload-Content-Length": str(len(video_bytes)),
            },
            json={"snippet": snippet, "status": status_payload},
            timeout=60,
        )
    if not init_response.ok:
        _raise_provider_error("youtube", init_response)

    upload_url = init_response.headers.get("Location")
    if not upload_url:
        raise PublishError("YouTube resumable upload URL was not returned.", retryable=False)

    upload_response = requests.put(
        upload_url,
        headers={"Content-Type": media.mime_type or "video/*"},
        data=video_bytes,
        timeout=600,
    )
    if not upload_response.ok:
        _raise_provider_error("youtube-upload", upload_response)

    return upload_response.json().get("id") or account.platform_account_id


def fetch_provider_live_metrics(
    post: ScheduledPost,
    account: SocialAccount,
) -> Dict[str, Any]:
    if not post.platform_post_id:
        raise UnsupportedPublishError("Provider post ID is not available for this post yet.")

    platform = post.platform

    if platform == "youtube":
        access_token = _get_youtube_access_token(account)
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/videos",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "part": "statistics,snippet,status",
                "id": post.platform_post_id,
            },
            timeout=30,
        )
        if not response.ok:
            _raise_provider_error("youtube-metrics", response)
        items = response.json().get("items", [])
        if not items:
            raise UnsupportedPublishError("YouTube did not return metrics for this video.")
        item = items[0]
        statistics = item.get("statistics", {})
        snippet = item.get("snippet", {})
        status_payload = item.get("status", {})
        return {
            "title": snippet.get("title"),
            "publishedAt": snippet.get("publishedAt"),
            "privacyStatus": status_payload.get("privacyStatus"),
            "viewCount": int(statistics.get("viewCount", 0)),
            "likeCount": int(statistics.get("likeCount", 0)),
            "favoriteCount": int(statistics.get("favoriteCount", 0)),
            "commentCount": int(statistics.get("commentCount", 0)),
        }

    access_token = decrypt_token(account.encrypted_token)

    if platform == "twitter":
        response = requests.get(
            f"https://api.twitter.com/2/tweets/{quote(post.platform_post_id, safe='')}",
            headers=_twitter_json_headers(access_token),
            params={"tweet.fields": "public_metrics,created_at,text"},
            timeout=30,
        )
        if not response.ok:
            _raise_provider_error("twitter-metrics", response, retryable=False)
        tweet = response.json().get("data", {})
        metrics = tweet.get("public_metrics", {})
        return {
            "createdAt": tweet.get("created_at"),
            "text": tweet.get("text"),
            "replyCount": int(metrics.get("reply_count", 0)),
            "retweetCount": int(metrics.get("retweet_count", 0)),
            "likeCount": int(metrics.get("like_count", 0)),
            "quoteCount": int(metrics.get("quote_count", 0)),
            "impressionCount": int(metrics.get("impression_count", 0)),
        }

    if platform == "linkedin":
        encoded_urn = quote(post.platform_post_id, safe="")
        response = requests.get(
            f"https://api.linkedin.com/rest/socialActions/{encoded_urn}",
            headers=_linkedin_headers(access_token, content_type="application/json"),
            timeout=30,
        )
        if not response.ok:
            _raise_provider_error("linkedin-metrics", response, retryable=False)
        payload = response.json()
        return {
            "likes": int(payload.get("likesSummary", {}).get("totalLikes", 0)),
            "comments": int(payload.get("commentsSummary", {}).get("totalFirstLevelComments", 0)),
        }

    if platform == "facebook":
        response = requests.get(
            f"https://graph.facebook.com/v18.0/{post.platform_post_id}",
            params={
                "fields": "likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions_unique)",
                "access_token": access_token,
            },
            timeout=30,
        )
        if not response.ok:
            _raise_provider_error("facebook-metrics", response, retryable=False)
        payload = response.json()
        insights = payload.get("insights", {}).get("data", [])
        impressions = 0
        if insights:
            values = insights[0].get("values", [])
            if values:
                impressions = int(values[0].get("value", 0))
        return {
            "likes": int(payload.get("likes", {}).get("summary", {}).get("total_count", 0)),
            "comments": int(payload.get("comments", {}).get("summary", {}).get("total_count", 0)),
            "shares": int(payload.get("shares", {}).get("count", 0)),
            "impressions": impressions,
        }

    if platform == "instagram":
        response = requests.get(
            f"https://graph.facebook.com/v18.0/{post.platform_post_id}",
            params={
                "fields": "comments_count,like_count,media_type,permalink,insights.metric(impressions,reach,saved,video_views)",
                "access_token": access_token,
            },
            timeout=30,
        )
        if not response.ok:
            _raise_provider_error("instagram-metrics", response, retryable=False)
        payload = response.json()
        insight_map = {}
        for item in payload.get("insights", {}).get("data", []):
            values = item.get("values", [])
            insight_map[item.get("name")] = values[0].get("value", 0) if values else 0
        return {
            "mediaType": payload.get("media_type"),
            "permalink": payload.get("permalink"),
            "likes": int(payload.get("like_count", 0)),
            "comments": int(payload.get("comments_count", 0)),
            "impressions": int(insight_map.get("impressions", 0)),
            "reach": int(insight_map.get("reach", 0)),
            "saved": int(insight_map.get("saved", 0)),
            "videoViews": int(insight_map.get("video_views", 0)),
        }

    raise UnsupportedPublishError(f"Live metrics are not supported for platform '{platform}'.")


# ============================================================================
# PUBLISHER INSTANCES (Must be after class definitions)
# ============================================================================

facebook_publisher = FacebookPublisher()
instagram_publisher = InstagramPublisher()
