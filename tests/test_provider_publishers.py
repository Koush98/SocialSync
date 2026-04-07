from types import SimpleNamespace

import pytest

from app.services.provider_publishers import (
    PublishError,
    UnsupportedPublishError,
    publish_to_facebook,
    publish_to_instagram,
    publish_to_linkedin,
    publish_to_twitter,
    publish_to_youtube,
)


class DummyResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload or {}
        self.status_code = status_code
        self.ok = status_code < 400
        self.headers = {}
        self.text = str(self._payload)

    def json(self):
        return self._payload


def test_publish_to_facebook_single_image_uses_photo_endpoint(monkeypatch):
    calls = []

    def fake_post(url, data=None, timeout=None):
        calls.append((url, data))
        return DummyResponse({"id": "media-post-1", "post_id": "page_post_1"})

    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)

    post = SimpleNamespace(content="Launch post")
    account = SimpleNamespace(platform_account_id="page_123")
    media = SimpleNamespace(file_type="image", file_url="https://cdn.example.com/image.jpg")

    provider_post_id = publish_to_facebook(post, account, "token-1", {}, [media])

    assert provider_post_id == "page_post_1"
    assert calls[0][0].endswith("/page_123/photos")
    assert calls[0][1]["url"] == "https://cdn.example.com/image.jpg"


def test_publish_to_instagram_requires_single_media():
    post = SimpleNamespace(content="Caption")
    account = SimpleNamespace(platform_account_id="ig_123")

    with pytest.raises(UnsupportedPublishError):
        publish_to_instagram(post, account, "token-1", {}, [])


def test_publish_to_linkedin_text_only_success(monkeypatch):
    captured = {}

    class LinkedInResponse(DummyResponse):
        def __init__(self):
            super().__init__({}, status_code=201)
            self.headers = {"x-restli-id": "linkedin-post-1"}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return LinkedInResponse()

    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)

    post = SimpleNamespace(content="LinkedIn launch update")
    account = SimpleNamespace(platform_account_id="person_123")

    provider_post_id = publish_to_linkedin(post, account, "token-1", {}, [])

    assert provider_post_id == "linkedin-post-1"
    assert captured["url"] == "https://api.linkedin.com/rest/posts"
    assert captured["headers"]["Linkedin-Version"] == "202604"
    assert captured["json"]["commentary"] == "LinkedIn launch update"
    assert captured["json"]["distribution"]["feedDistribution"] == "MAIN_FEED"


def test_publish_to_linkedin_requires_text_content():
    post = SimpleNamespace(content="")
    account = SimpleNamespace(platform_account_id="person_123")

    with pytest.raises(PublishError, match="LinkedIn post content is required when no media is attached"):
        publish_to_linkedin(post, account, "token-1", {}, [])


def test_publish_to_linkedin_image_success(monkeypatch):
    captured = {"calls": []}

    class InitResponse(DummyResponse):
        def __init__(self):
            super().__init__({"value": {"uploadUrl": "https://linkedin.upload/image", "image": "urn:li:image:123"}}, status_code=200)

    class CreateResponse(DummyResponse):
        def __init__(self):
            super().__init__({}, status_code=201)
            self.headers = {"x-restli-id": "linkedin-post-image-1"}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["calls"].append(("post", url, json))
        if "images?action=initializeUpload" in url:
            return InitResponse()
        if url.endswith("/rest/posts"):
            return CreateResponse()
        raise AssertionError(f"Unexpected POST url: {url}")

    def fake_put(url, headers=None, data=None, timeout=None):
        captured["calls"].append(("put", url, headers))
        return DummyResponse({}, status_code=201)

    monkeypatch.setattr("app.services.provider_publishers._download_media", lambda media: b"image-bytes")
    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)
    monkeypatch.setattr("app.services.provider_publishers.requests.put", fake_put)

    post = SimpleNamespace(content="LinkedIn image update")
    account = SimpleNamespace(platform_account_id="person_123")
    media = [SimpleNamespace(file_type="image", file_url="https://cdn.example.com/image.jpg", mime_type="image/jpeg", alt_text="Launch card")]

    provider_post_id = publish_to_linkedin(post, account, "token-1", {}, media)

    assert provider_post_id == "linkedin-post-image-1"
    assert captured["calls"][1][0] == "put"
    assert captured["calls"][2][2]["content"]["media"]["id"] == "urn:li:image:123"
    assert captured["calls"][2][2]["content"]["media"]["altText"] == "Launch card"


def test_publish_to_linkedin_video_success(monkeypatch):
    captured = {"calls": []}

    class InitVideoResponse(DummyResponse):
        def __init__(self):
            super().__init__(
                {
                    "value": {
                        "video": "urn:li:video:123",
                        "uploadToken": "upload-token-1",
                        "uploadInstructions": [
                            {
                                "uploadUrl": "https://linkedin.upload/video-part-1",
                                "firstByte": 0,
                                "lastByte": 3,
                            }
                        ],
                    }
                },
                status_code=200,
            )

    class FinalizeResponse(DummyResponse):
        def __init__(self):
            super().__init__({}, status_code=200)

    class CreateResponse(DummyResponse):
        def __init__(self):
            super().__init__({}, status_code=201)
            self.headers = {"x-restli-id": "linkedin-post-video-1"}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["calls"].append(("post", url, json))
        if "videos?action=initializeUpload" in url:
            return InitVideoResponse()
        if "videos?action=finalizeUpload" in url:
            return FinalizeResponse()
        if url.endswith("/rest/posts"):
            return CreateResponse()
        raise AssertionError(f"Unexpected POST url: {url}")

    def fake_put(url, headers=None, data=None, timeout=None):
        captured["calls"].append(("put", url, headers, data))
        response = DummyResponse({}, status_code=200)
        response.headers = {"etag": '"etag-1"'}
        return response

    def fake_get(url, headers=None, timeout=None):
        captured["calls"].append(("get", url, None))
        return DummyResponse({"status": "AVAILABLE"}, status_code=200)

    monkeypatch.setattr("app.services.provider_publishers._download_media", lambda media: b"video")
    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)
    monkeypatch.setattr("app.services.provider_publishers.requests.put", fake_put)
    monkeypatch.setattr("app.services.provider_publishers.requests.get", fake_get)

    post = SimpleNamespace(content="LinkedIn video update")
    account = SimpleNamespace(platform_account_id="person_123")
    media = [SimpleNamespace(file_type="video", file_url="https://cdn.example.com/video.mp4", mime_type="video/mp4", alt_text="Launch walk-through")]

    provider_post_id = publish_to_linkedin(post, account, "token-1", {"title": "Demo clip"}, media)

    assert provider_post_id == "linkedin-post-video-1"
    assert captured["calls"][2][2]["finalizeUploadRequest"]["uploadedPartIds"] == ["etag-1"]
    assert captured["calls"][4][2]["content"]["media"]["id"] == "urn:li:video:123"
    assert captured["calls"][4][2]["content"]["media"]["title"] == "Demo clip"


def test_publish_to_linkedin_rejects_multiple_media():
    post = SimpleNamespace(content="LinkedIn launch update")
    account = SimpleNamespace(platform_account_id="person_123")
    media = [
        SimpleNamespace(file_type="image", file_url="https://cdn.example.com/image-1.jpg"),
        SimpleNamespace(file_type="image", file_url="https://cdn.example.com/image-2.jpg"),
    ]

    with pytest.raises(UnsupportedPublishError, match="one image or one video"):
        publish_to_linkedin(post, account, "token-1", {}, media)


def test_publish_to_twitter_text_only_success(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return DummyResponse({"data": {"id": "tweet-1"}})

    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)

    post = SimpleNamespace(content="Campaign copy")
    account = SimpleNamespace(platform_account_id="tw_123")

    provider_post_id = publish_to_twitter(post, account, "token-1", {}, [])

    assert provider_post_id == "tweet-1"
    assert captured["url"] == "https://api.twitter.com/2/tweets"
    assert captured["json"]["text"] == "Campaign copy"


def test_publish_to_twitter_requires_text_or_media():
    post = SimpleNamespace(content="")
    account = SimpleNamespace(platform_account_id="tw_123")

    with pytest.raises(PublishError, match="Twitter post text or media is required"):
        publish_to_twitter(post, account, "token-1", {}, [])


def test_publish_to_twitter_image_success(monkeypatch):
    calls = []

    def fake_post(url, headers=None, json=None, data=None, files=None, timeout=None):
        calls.append((url, json, data, files))
        if url == "https://api.x.com/2/media/upload":
            return DummyResponse({"data": {"id": "media-image-1"}}, status_code=200)
        if url == "https://api.twitter.com/2/tweets":
            return DummyResponse({"data": {"id": "tweet-2"}}, status_code=201)
        raise AssertionError(f"Unexpected POST url: {url}")

    monkeypatch.setattr("app.services.provider_publishers._download_media", lambda media: b"image-bytes")
    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)

    post = SimpleNamespace(content="Campaign copy")
    account = SimpleNamespace(platform_account_id="tw_123")
    media = [SimpleNamespace(file_type="image", file_url="https://cdn.example.com/image.jpg")]

    provider_post_id = publish_to_twitter(post, account, "token-1", {}, media)

    assert provider_post_id == "tweet-2"
    assert calls[1][1]["media"]["media_ids"] == ["media-image-1"]


def test_publish_to_twitter_video_success(monkeypatch):
    calls = []

    def fake_post(url, headers=None, json=None, data=None, files=None, timeout=None):
        calls.append((url, json, data))
        if url.endswith("/initialize"):
            return DummyResponse({"data": {"id": "media-video-1"}}, status_code=200)
        if url.endswith("/append"):
            return DummyResponse({}, status_code=204)
        if url.endswith("/finalize"):
            return DummyResponse({"data": {"id": "media-video-1"}}, status_code=200)
        if url == "https://api.twitter.com/2/tweets":
            return DummyResponse({"data": {"id": "tweet-video-1"}}, status_code=201)
        raise AssertionError(f"Unexpected POST url: {url}")

    def fake_get(url, headers=None, params=None, timeout=None):
        calls.append((url, params, None))
        return DummyResponse({"data": {"processing_info": {"state": "succeeded"}}}, status_code=200)

    monkeypatch.setattr("app.services.provider_publishers._download_media", lambda media: b"video-bytes")
    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)
    monkeypatch.setattr("app.services.provider_publishers.requests.get", fake_get)

    post = SimpleNamespace(content="Video launch")
    account = SimpleNamespace(platform_account_id="tw_123")
    media = [SimpleNamespace(file_type="video", file_url="https://cdn.example.com/video.mp4", mime_type="video/mp4")]

    provider_post_id = publish_to_twitter(post, account, "token-1", {}, media)

    assert provider_post_id == "tweet-video-1"
    assert calls[-1][1]["media"]["media_ids"] == ["media-video-1"]


def test_publish_to_twitter_rejects_mixed_media():
    post = SimpleNamespace(content="Campaign copy")
    account = SimpleNamespace(platform_account_id="tw_123")
    media = [
        SimpleNamespace(file_type="image", file_url="https://cdn.example.com/image.jpg"),
        SimpleNamespace(file_type="video", file_url="https://cdn.example.com/video.mp4"),
    ]

    with pytest.raises(UnsupportedPublishError, match="up to 4 images or a single video"):
        publish_to_twitter(post, account, "token-1", {}, media)


def test_publish_to_youtube_requires_single_video():
    post = SimpleNamespace(content="Video caption")
    account = SimpleNamespace(platform_account_id="yt_123")
    media = [SimpleNamespace(file_type="image", file_url="https://cdn.example.com/image.jpg")]

    with pytest.raises(UnsupportedPublishError):
        publish_to_youtube(post, account, "token-1", {}, media)


def test_publish_to_youtube_requires_title(monkeypatch):
    monkeypatch.setattr("app.services.provider_publishers._download_media", lambda media: b"video-bytes")

    post = SimpleNamespace(content="Video caption")
    account = SimpleNamespace(platform_account_id="yt_123")
    media = [SimpleNamespace(file_type="video", file_url="https://cdn.example.com/video.mp4", mime_type="video/mp4")]

    with pytest.raises(PublishError, match="YouTube video title is required"):
        publish_to_youtube(post, account, "token-1", {}, media)


def test_publish_to_youtube_rejects_native_scheduling(monkeypatch):
    monkeypatch.setattr("app.services.provider_publishers._download_media", lambda media: b"video-bytes")

    post = SimpleNamespace(content="Video caption")
    account = SimpleNamespace(platform_account_id="yt_123")
    media = [SimpleNamespace(file_type="video", file_url="https://cdn.example.com/video.mp4", mime_type="video/mp4")]

    with pytest.raises(UnsupportedPublishError, match="SocialSync scheduling"):
        publish_to_youtube(post, account, "token-1", {"title": "Launch video", "publishAt": "2026-04-06T10:00:00Z"}, media)


def test_publish_to_youtube_text_video_success(monkeypatch):
    calls = []

    class InitResponse(DummyResponse):
        def __init__(self):
            super().__init__({}, status_code=200)
            self.headers = {"Location": "https://upload.youtube.test/resumable/123"}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(("post", url, headers, json))
        return InitResponse()

    def fake_put(url, headers=None, data=None, timeout=None):
        calls.append(("put", url, headers, data))
        return DummyResponse({"id": "yt-video-1"}, status_code=200)

    monkeypatch.setattr("app.services.provider_publishers._download_media", lambda media: b"video-bytes")
    monkeypatch.setattr("app.services.provider_publishers.requests.post", fake_post)
    monkeypatch.setattr("app.services.provider_publishers.requests.put", fake_put)

    post = SimpleNamespace(content="YouTube upload description")
    account = SimpleNamespace(platform_account_id="yt_123")
    media = [SimpleNamespace(file_type="video", file_url="https://cdn.example.com/video.mp4", mime_type="video/mp4")]

    provider_post_id = publish_to_youtube(
        post,
        account,
        "token-1",
        {
            "title": "Launch video",
            "privacyStatus": "private",
            "tags": ["crm", "launch"],
            "madeForKids": False,
            "notifySubscribers": False,
        },
        media,
    )

    assert provider_post_id == "yt-video-1"
    assert calls[0][0] == "post"
    assert "notifySubscribers=false" in calls[0][1]
    assert calls[0][3]["snippet"]["title"] == "Launch video"
    assert calls[0][3]["snippet"]["description"] == "YouTube upload description"
    assert calls[0][3]["status"]["privacyStatus"] == "private"
    assert calls[0][3]["status"]["selfDeclaredMadeForKids"] is False
