from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google.oauth2 import id_token
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from .settings import settings

IDENTITY_SCOPES = ["openid", "email", "profile"]
YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly", "openid", "email"]


def _flow(scopes: list[str], redirect_uri: str, state: str | None = None) -> Flow:
    options = {"state": state} if state else {}
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=scopes,
        redirect_uri=redirect_uri,
        **options,
    )


def identity_authorization_url() -> tuple[str, str]:
    flow = _flow(IDENTITY_SCOPES, settings.google_identity_redirect_uri)
    url, state = flow.authorization_url(prompt="select_account")
    return url, state


def youtube_authorization_url() -> tuple[str, str]:
    flow = _flow(YOUTUBE_SCOPES, settings.google_youtube_redirect_uri)
    url, _state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return url, _state


def exchange_identity_code(code: str, state: str) -> Credentials:
    flow = _flow(IDENTITY_SCOPES, settings.google_identity_redirect_uri, state)
    flow.fetch_token(code=code)
    return flow.credentials


def exchange_youtube_code(code: str, state: str) -> Credentials:
    flow = _flow(YOUTUBE_SCOPES, settings.google_youtube_redirect_uri, state)
    flow.fetch_token(code=code)
    return flow.credentials


def verify_identity_token(token: str) -> dict:
    return id_token.verify_oauth2_token(token, Request(), settings.google_client_id)


def creds_from_refresh(refresh_token: str) -> Credentials:
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )
    creds.refresh(Request())
    return creds


def service_for(refresh_token: str):
    return build("youtube", "v3", credentials=creds_from_refresh(refresh_token))


def _pick_thumb(thumbs: dict) -> str:
    for key in ("high", "medium", "default", "standard", "maxres"):
        url = (thumbs.get(key) or {}).get("url")
        if url:
            return url
    return ""


def _pick_banner(image: dict) -> str:
    if not image:
        return ""
    for key in (
        "bannerExternalUrl",
        "bannerTvHighImageUrl",
        "bannerTvImageUrl",
        "bannerTvMediumImageUrl",
        "bannerMobileExtraHdImageUrl",
        "bannerMobileHdImageUrl",
        "bannerMobileLowImageUrl",
        "bannerTabletHdImageUrl",
        "bannerImageUrl",
    ):
        val = image.get(key)
        if val:
            return val
    for val in image.values():
        if isinstance(val, str) and val.startswith("http"):
            return val
    return ""


def fetch_channel(creds: Credentials, youtube_channel_id: str = "") -> dict:
    service = build("youtube", "v3", credentials=creds)
    kwargs = {"part": "snippet,contentDetails,brandingSettings,statistics"}
    if youtube_channel_id:
        kwargs["id"] = youtube_channel_id
    else:
        kwargs["mine"] = True
    resp = service.channels().list(**kwargs).execute()
    items = resp.get("items") or []
    if not items:
        return {
            "youtube_channel_id": "",
            "title": "",
            "uploads": "",
            "thumbnail_url": "",
            "banner_url": "",
            "description": "",
            "yt_published_at": "",
            "subscriber_count": 0,
            "video_count": 0,
            "hidden_subscribers": False,
        }
    item = items[0]
    snippet = item.get("snippet") or {}
    stats = item.get("statistics") or {}
    uploads = (
        item.get("contentDetails", {})
        .get("relatedPlaylists", {})
        .get("uploads", "")
    )
    return {
        "youtube_channel_id": item["id"],
        "title": snippet.get("title") or "",
        "uploads": uploads,
        "thumbnail_url": _pick_thumb(snippet.get("thumbnails") or {}),
        "banner_url": _pick_banner((item.get("brandingSettings") or {}).get("image") or {}),
        "description": snippet.get("description") or "",
        "yt_published_at": (snippet.get("publishedAt") or "")[:10],
        "subscriber_count": int(stats.get("subscriberCount") or 0),
        "video_count": int(stats.get("videoCount") or 0),
        "hidden_subscribers": bool(stats.get("hiddenSubscriberCount")),
    }


def list_available_channels(creds: Credentials) -> list[dict]:
    service = build("youtube", "v3", credentials=creds)
    channels = []
    page_token = None
    while True:
        response = service.channels().list(
            part="snippet,brandingSettings,statistics",
            mine=True,
            maxResults=50,
            pageToken=page_token,
        ).execute()
        for item in response.get("items") or []:
            snippet = item.get("snippet") or {}
            stats = item.get("statistics") or {}
            channels.append(
                {
                    "youtube_channel_id": item["id"],
                    "title": snippet.get("title") or "",
                    "thumbnail_url": _pick_thumb(snippet.get("thumbnails") or {}),
                    "banner_url": _pick_banner(
                        (item.get("brandingSettings") or {}).get("image") or {}
                    ),
                    "description": snippet.get("description") or "",
                    "yt_published_at": (snippet.get("publishedAt") or "")[:10],
                    "subscriber_count": int(stats.get("subscriberCount") or 0),
                }
            )
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return channels


def list_playlists(refresh_token: str) -> list[dict]:
    service = service_for(refresh_token)
    out = []
    token = None
    while True:
        resp = service.playlists().list(
            part="snippet",
            mine=True,
            maxResults=50,
            pageToken=token,
        ).execute()
        for item in resp.get("items") or []:
            out.append(
                {
                    "id": item["id"],
                    "title": item["snippet"]["title"],
                }
            )
        token = resp.get("nextPageToken")
        if not token or len(out) >= 200:
            break
    return out


def list_videos(
    refresh_token: str,
    youtube_channel_id: str,
    page_token: str | None = None,
    uploads_playlist_id: str | None = None,
    limit: int = 50,
) -> dict:
    if not youtube_channel_id:
        raise ValueError("youtube_channel_id is required")
    page_size = min(max(limit, 1), 50)
    credentials = creds_from_refresh(refresh_token)
    service = build("youtube", "v3", credentials=credentials)

    if uploads_playlist_id is None:
        channel_response = service.channels().list(
            part="contentDetails",
            id=youtube_channel_id,
            maxResults=1,
        ).execute()
        channel_items = channel_response.get("items") or []
        if not channel_items or channel_items[0].get("id") != youtube_channel_id:
            raise LookupError("selected YouTube channel is unavailable to this connection")
        uploads_playlist_id = (
            channel_items[0].get("contentDetails", {})
            .get("relatedPlaylists", {})
            .get("uploads")
        )
        if not uploads_playlist_id:
            raise LookupError("selected YouTube channel has no uploads playlist")

    page_kwargs = {
        "part": "contentDetails",
        "playlistId": uploads_playlist_id,
        "maxResults": page_size,
    }
    if page_token:
        page_kwargs["pageToken"] = page_token
    playlist_response = service.playlistItems().list(**page_kwargs).execute()
    video_ids = list(
        dict.fromkeys(
            item.get("contentDetails", {}).get("videoId")
            for item in playlist_response.get("items") or []
            if item.get("contentDetails", {}).get("videoId")
        )
    )

    videos = []
    if video_ids:
        video_response = service.videos().list(
            part="snippet,status,contentDetails,statistics",
            id=",".join(video_ids),
        ).execute()
        for item in video_response.get("items") or []:
            snippet = item.get("snippet") or {}
            status = item.get("status") or {}
            content = item.get("contentDetails") or {}
            statistics = item.get("statistics") or {}
            if snippet.get("channelId") != youtube_channel_id:
                continue
            thumbnails = snippet.get("thumbnails") or {}
            videos.append(
                {
                    "youtube_video_id": item["id"],
                    "youtube_title": snippet.get("title"),
                    "youtube_description": snippet.get("description"),
                    "youtube_tags": snippet.get("tags") or [],
                    "youtube_thumbnail_url": _pick_thumb(thumbnails),
                    "youtube_category_id": snippet.get("categoryId"),
                    "youtube_default_language": snippet.get("defaultLanguage"),
                    "youtube_default_audio_language": snippet.get("defaultAudioLanguage"),
                    "youtube_duration": content.get("duration"),
                    "youtube_published_at": snippet.get("publishedAt"),
                    "youtube_scheduled_at": status.get("publishAt"),
                    "youtube_visibility": status.get("privacyStatus"),
                    "youtube_upload_status": status.get("uploadStatus"),
                    "youtube_view_count": _optional_int(statistics.get("viewCount")),
                    "youtube_like_count": _optional_int(statistics.get("likeCount")),
                    "youtube_comment_count": _optional_int(statistics.get("commentCount")),
                    "youtube_captions_available": _optional_bool(content.get("caption")),
                    "youtube_made_for_kids": status.get(
                        "madeForKids", status.get("selfDeclaredMadeForKids")
                    ),
                }
            )

    return {
        "uploads_playlist_id": uploads_playlist_id,
        "video_ids": video_ids,
        "videos": videos,
        "next_page_token": playlist_response.get("nextPageToken"),
    }


def _optional_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _optional_bool(value: str | bool | None) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return value.lower() == "true"
