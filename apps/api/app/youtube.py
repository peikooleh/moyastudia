import io

from collections.abc import Callable
from contextlib import contextmanager
from contextvars import ContextVar

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google.oauth2 import id_token
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from .settings import settings

IDENTITY_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]


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


def youtube_authorization_url(force_consent: bool = False) -> tuple[str, str]:
    flow = _flow(YOUTUBE_SCOPES, settings.google_youtube_redirect_uri)
    url, _state = flow.authorization_url(
        access_type="offline",
        prompt="consent select_account" if force_consent else "select_account",
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
    return id_token.verify_oauth2_token(
        token,
        Request(),
        settings.google_client_id,
        clock_skew_in_seconds=1,
    )


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


ANALYTICS_METRICS = (
    "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,"
    "likes,comments,shares,subscribersGained,subscribersLost"
)
PLAYLIST_ANALYTICS_METRICS = "views,estimatedMinutesWatched,averageViewDuration"


def _analytics_filter(video_id: str = "", playlist_id: str = "") -> str:
    if video_id:
        return f"video=={video_id}"
    if playlist_id:
        return f"playlist=={playlist_id}"
    return ""


def _analytics_row(response: dict) -> dict:
    rows = response.get("rows") or []
    row = rows[0] if rows else []
    values = list(row) + [0] * 9
    return {
        "views": int(values[0] or 0),
        "estimated_minutes_watched": float(values[1] or 0),
        "average_view_duration": float(values[2] or 0),
        "average_view_percentage": float(values[3] or 0),
        "likes": int(values[4] or 0),
        "comments": int(values[5] or 0),
        "shares": int(values[6] or 0),
        "subscribers_gained": int(values[7] or 0),
        "subscribers_lost": int(values[8] or 0),
    }


def channel_analytics_summary(
    refresh_token: str,
    start_date: str,
    end_date: str,
    video_id: str = "",
    playlist_id: str = "",
) -> dict:
    service = build("youtubeAnalytics", "v2", credentials=creds_from_refresh(refresh_token))
    kwargs = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": PLAYLIST_ANALYTICS_METRICS if playlist_id else ANALYTICS_METRICS,
    }
    analytics_filter = _analytics_filter(video_id, playlist_id)
    if analytics_filter:
        kwargs["filters"] = analytics_filter
    response = service.reports().query(**kwargs).execute()
    if playlist_id:
        rows = response.get("rows") or []
        row = list(rows[0]) if rows else []
        values = row + [0] * 3
        summary = {
            "views": int(values[0] or 0),
            "estimated_minutes_watched": float(values[1] or 0),
            "average_view_duration": float(values[2] or 0),
            "average_view_percentage": None,
            "likes": None,
            "comments": None,
            "shares": None,
            "subscribers_gained": None,
            "subscribers_lost": None,
        }
    else:
        summary = _analytics_row(response)
    return {
        **summary,
        "start_date": start_date,
        "end_date": end_date,
        "video_id": video_id or None,
        "playlist_id": playlist_id or None,
    }


def channel_analytics_timeseries(
    refresh_token: str,
    start_date: str,
    end_date: str,
    video_id: str = "",
    playlist_id: str = "",
    dimension: str = "day",
) -> list[dict]:
    service = build("youtubeAnalytics", "v2", credentials=creds_from_refresh(refresh_token))
    kwargs = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "views,estimatedMinutesWatched",
        "dimensions": dimension,
        "sort": dimension,
    }
    analytics_filter = _analytics_filter(video_id, playlist_id)
    if analytics_filter:
        kwargs["filters"] = analytics_filter
    response = service.reports().query(**kwargs).execute()
    result = []
    for row in response.get("rows") or []:
        if len(row) < 3:
            continue
        result.append({
            "date": str(row[0]),
            "views": int(row[1] or 0),
            "estimated_minutes_watched": float(row[2] or 0),
        })
    return result


QuotaRecorder = Callable[[str, str], None]
_current_quota_recorder: ContextVar[QuotaRecorder | None] = ContextVar(
    "youtube_quota_recorder", default=None
)


@contextmanager
def quota_recording(recorder: QuotaRecorder):
    token = _current_quota_recorder.set(recorder)
    try:
        yield
    finally:
        _current_quota_recorder.reset(token)


def _execute(request, operation: str, recorder: QuotaRecorder | None = None):
    recorder = recorder or _current_quota_recorder.get()
    try:
        response = request.execute()
    except Exception:
        if recorder:
            recorder(operation, "youtube_error")
        raise
    if recorder:
        recorder(operation, "success")
    return response


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


def fetch_channel(creds: Credentials, youtube_channel_id: str = "", recorder: QuotaRecorder | None = None) -> dict:
    service = build("youtube", "v3", credentials=creds)
    kwargs = {"part": "snippet,contentDetails,brandingSettings,statistics"}
    if youtube_channel_id:
        kwargs["id"] = youtube_channel_id
    else:
        kwargs["mine"] = True
    resp = _execute(service.channels().list(**kwargs), "channels.list", recorder)
    items = resp.get("items") or []
    if not items:
        return {
            "youtube_channel_id": "",
            "title": "",
            "uploads": "",
            "thumbnail_url": "",
            "banner_url": "",
            "description": "",
            "keywords": "",
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
        "keywords": ((item.get("brandingSettings") or {}).get("channel") or {}).get("keywords") or "",
        "yt_published_at": (snippet.get("publishedAt") or "")[:10],
        "subscriber_count": int(stats.get("subscriberCount") or 0),
        "video_count": int(stats.get("videoCount") or 0),
        "hidden_subscribers": bool(stats.get("hiddenSubscriberCount")),
    }


def list_available_channels(creds: Credentials, recorder: QuotaRecorder | None = None) -> list[dict]:
    service = build("youtube", "v3", credentials=creds)
    channels = []
    page_token = None
    while True:
        response = _execute(
            service.channels().list(
                part="snippet,brandingSettings,statistics",
                mine=True,
                maxResults=50,
                pageToken=page_token,
            ),
            "channels.list",
            recorder,
        )
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


def list_playlists(refresh_token: str, youtube_channel_id: str, recorder: QuotaRecorder | None = None) -> list[dict]:
    service = service_for(refresh_token)
    out = []
    token = None
    seen_page_tokens = set()
    while True:
        if token:
            if token in seen_page_tokens:
                raise RuntimeError("YouTube playlists pagination token repeated")
            seen_page_tokens.add(token)
        resp = _execute(
            service.playlists().list(
                part="snippet,status,contentDetails",
                channelId=youtube_channel_id,
                maxResults=50,
                pageToken=token,
            ),
            "playlists.list",
            recorder,
        )
        for item in resp.get("items") or []:
            snippet = item.get("snippet") or {}
            if snippet.get("channelId") != youtube_channel_id:
                continue
            out.append(
                {
                    "id": item["id"],
                    "title": snippet.get("title") or "",
                    "description": snippet.get("description") or "",
                    "thumb": _pick_thumb(snippet.get("thumbnails") or {}),
                    "publishedAt": snippet.get("publishedAt") or "",
                    "privacy": (item.get("status") or {}).get("privacyStatus") or "",
                    "itemCount": (item.get("contentDetails") or {}).get("itemCount"),
                }
            )
        next_token = resp.get("nextPageToken")
        if next_token and next_token in seen_page_tokens:
            raise RuntimeError("YouTube playlists pagination token repeated")
        token = next_token
        if not token:
            break
    return out


def list_playlist_items(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_id: str,
    page_token: str | None = None,
    limit: int = 50,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    playlist_response = _execute(service.playlists().list(
        part="snippet",
        id=playlist_id,
        maxResults=1,
    ), "playlists.list", recorder)
    playlists = playlist_response.get("items") or []
    if not playlists or (playlists[0].get("snippet") or {}).get("channelId") != youtube_channel_id:
        raise LookupError("playlist does not belong to the selected channel")

    page_kwargs = {
        "part": "snippet,contentDetails,status",
        "playlistId": playlist_id,
        "maxResults": min(max(limit, 1), 50),
    }
    if page_token:
        page_kwargs["pageToken"] = page_token
    response = _execute(service.playlistItems().list(**page_kwargs), "playlistItems.list", recorder)
    items = []
    for item in response.get("items") or []:
        snippet = item.get("snippet") or {}
        content = item.get("contentDetails") or {}
        resource = snippet.get("resourceId") or {}
        video_id = content.get("videoId") or resource.get("videoId")
        if not video_id:
            continue
        items.append(
            {
                "playlistItemId": item.get("id") or "",
                "videoId": video_id,
                "title": snippet.get("title") or "",
                "thumb": _pick_thumb(snippet.get("thumbnails") or {}),
                "position": snippet.get("position"),
                "privacy": (item.get("status") or {}).get("privacyStatus") or "",
            }
        )
    video_ids = [item["videoId"] for item in items]
    snapshots = {}
    if video_ids:
        video_response = _execute(
            service.videos().list(
                part="snippet,status,contentDetails,statistics",
                id=",".join(video_ids),
            ),
            "videos.list",
            recorder,
        )
        for video in video_response.get("items") or []:
            snippet = video.get("snippet") or {}
            status = video.get("status") or {}
            content = video.get("contentDetails") or {}
            statistics = video.get("statistics") or {}
            title = snippet.get("title") or ""
            snapshots[video["id"]] = {
                "youtubeId": video["id"],
                "title": title,
                "effectiveTitle": title,
                "description": snippet.get("description") or "",
                "tags": ", ".join(snippet.get("tags") or []),
                "category": snippet.get("categoryId") or "",
                "language": snippet.get("defaultLanguage") or snippet.get("defaultAudioLanguage") or "",
                "privacy": status.get("privacyStatus") or "",
                "status": status.get("privacyStatus") or "unknown",
                "availability": "available",
                "remoteMissing": False,
                "thumb": _pick_thumb(snippet.get("thumbnails") or {}),
                "publishedAt": snippet.get("publishedAt") or "",
                "duration": content.get("duration") or "",
                "views": _optional_int(statistics.get("viewCount")),
                "likes": _optional_int(statistics.get("likeCount")),
                "comments": _optional_int(statistics.get("commentCount")),
                "captions": _optional_bool(content.get("caption")),
                "madeForKids": _optional_bool(status.get("madeForKids", status.get("selfDeclaredMadeForKids"))),
            }
    for item in items:
        item["videoSnapshot"] = snapshots.get(item["videoId"])
    return {"items": items, "nextPageToken": response.get("nextPageToken")}


def list_playlist_memberships(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_ids: list[str],
    video_ids: list[str],
    recorder: QuotaRecorder | None = None,
) -> dict[str, list[str]]:
    wanted = {video_id for video_id in video_ids if video_id}
    memberships = {video_id: [] for video_id in wanted}
    if not wanted:
        return memberships
    service = service_for(refresh_token)
    for playlist_id in playlist_ids:
        if not playlist_id:
            continue
        playlist_response = _execute(
            service.playlists().list(part="snippet", id=playlist_id, maxResults=1),
            "playlists.list",
            recorder,
        )
        playlists = playlist_response.get("items") or []
        if not playlists or (playlists[0].get("snippet") or {}).get("channelId") != youtube_channel_id:
            continue
        token = None
        while True:
            kwargs = {"part": "contentDetails", "playlistId": playlist_id, "maxResults": 50}
            if token:
                kwargs["pageToken"] = token
            response = _execute(
                service.playlistItems().list(**kwargs),
                "playlistItems.list",
                recorder,
            )
            for item in response.get("items") or []:
                video_id = (item.get("contentDetails") or {}).get("videoId")
                if video_id in wanted:
                    memberships[video_id].append(playlist_id)
            token = response.get("nextPageToken")
            if not token:
                break
    return memberships


def list_videos(
    refresh_token: str,
    youtube_channel_id: str,
    page_token: str | None = None,
    uploads_playlist_id: str | None = None,
    limit: int = 50,
    recorder: QuotaRecorder | None = None,
) -> dict:
    if not youtube_channel_id:
        raise ValueError("youtube_channel_id is required")
    page_size = min(max(limit, 1), 50)
    credentials = creds_from_refresh(refresh_token)
    service = build("youtube", "v3", credentials=credentials)

    search_kwargs = {
        "part": "id",
        "forMine": True,
        "type": "video",
        "order": "date",
        "maxResults": page_size,
    }
    if page_token:
        search_kwargs["pageToken"] = page_token
    search_response = _execute(
        service.search().list(**search_kwargs),
        "search.list",
        recorder,
    )
    video_ids = list(
        dict.fromkeys(
            item.get("id", {}).get("videoId")
            for item in search_response.get("items") or []
            if item.get("id", {}).get("videoId")
        )
    )

    videos = []
    if video_ids:
        video_response = _execute(
            service.videos().list(
                part="snippet,status,contentDetails,statistics",
                id=",".join(video_ids),
            ),
            "videos.list",
            recorder,
        )
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
        "uploads_playlist_id": None,
        "video_ids": video_ids,
        "videos": videos,
        "next_page_token": search_response.get("nextPageToken"),
    }


def create_playlist(
    refresh_token: str,
    *,
    title: str,
    description: str = "",
    privacy_status: str = "private",
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    response = _execute(
        service.playlists().insert(
            part="snippet,status",
            body={
                "snippet": {"title": title, "description": description},
                "status": {"privacyStatus": privacy_status},
            },
        ),
        "playlists.insert",
        recorder,
    )
    return {
        "id": response.get("id") or "",
        "title": (response.get("snippet") or {}).get("title") or title,
        "description": (response.get("snippet") or {}).get("description") or description,
        "privacy": (response.get("status") or {}).get("privacyStatus") or privacy_status,
    }


def _owned_playlist(service, youtube_channel_id: str, playlist_id: str, recorder: QuotaRecorder | None = None) -> dict:
    response = _execute(
        service.playlists().list(part="snippet,status", id=playlist_id, maxResults=1),
        "playlists.list",
        recorder,
    )
    items = response.get("items") or []
    if not items or (items[0].get("snippet") or {}).get("channelId") != youtube_channel_id:
        raise LookupError("playlist does not belong to the selected channel")
    return items[0]



def update_channel_metadata(
    refresh_token: str,
    youtube_channel_id: str,
    *,
    description: str,
    keywords: str,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    listed = _execute(
        service.channels().list(part="brandingSettings", id=youtube_channel_id),
        "channels.list",
        recorder,
    ).get("items") or []
    if not listed:
        raise LookupError("channel not found")
    branding = listed[0].get("brandingSettings") or {}
    channel_branding = dict(branding.get("channel") or {})
    channel_branding["description"] = description
    channel_branding["keywords"] = keywords
    response = _execute(
        service.channels().update(
            part="brandingSettings",
            body={
                "id": youtube_channel_id,
                "brandingSettings": {**branding, "channel": channel_branding},
            },
        ),
        "channels.update",
        recorder,
    )
    returned = ((response.get("brandingSettings") or {}).get("channel") or {})
    return {
        "description": returned.get("description", description),
        "keywords": returned.get("keywords", keywords),
    }


def update_playlist_metadata(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_id: str,
    *,
    title: str,
    description: str,
    privacy: str,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    current = _owned_playlist(service, youtube_channel_id, playlist_id, recorder)
    status = current.get("status") or {}
    response = _execute(
        service.playlists().update(
            part="snippet,status",
            body={
                "id": playlist_id,
                "snippet": {"title": title, "description": description},
                "status": {"privacyStatus": privacy},
            },
        ),
        "playlists.update",
        recorder,
    )
    snippet = response.get("snippet") or {}
    return {
        "id": response.get("id") or playlist_id,
        "title": snippet.get("title") or title,
        "description": snippet.get("description") or description,
        "privacy": (response.get("status") or {}).get("privacyStatus") or status.get("privacyStatus") or "",
        "thumb": _pick_thumb(snippet.get("thumbnails") or {}),
    }


def set_playlist_thumbnail(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_id: str,
    data: bytes,
    content_type: str,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    _owned_playlist(service, youtube_channel_id, playlist_id, recorder)
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type, resumable=False)
    existing = _execute(
        service.playlistImages().list(part="snippet", playlistId=playlist_id, maxResults=50),
        "playlistImages.list",
        recorder,
    ).get("items") or []
    body = {"snippet": {"playlistId": playlist_id, "type": "custom"}}
    if existing:
        response = _execute(
            service.playlistImages().update(part="snippet", body=body, media_body=media),
            "playlistImages.update",
            recorder,
        )
    else:
        response = _execute(
            service.playlistImages().insert(part="snippet", body=body, media_body=media),
            "playlistImages.insert",
            recorder,
        )
    return {"ok": True, "id": response.get("id") or "", "playlistId": playlist_id}


def update_playlist_item_position(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_id: str,
    playlist_item_id: str,
    position: int,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    _owned_playlist(service, youtube_channel_id, playlist_id, recorder)
    listed = _execute(
        service.playlistItems().list(part="snippet", id=playlist_item_id, maxResults=1),
        "playlistItems.list",
        recorder,
    ).get("items") or []
    if not listed or (listed[0].get("snippet") or {}).get("playlistId") != playlist_id:
        raise LookupError("playlist item does not belong to the selected playlist")
    snippet = listed[0].get("snippet") or {}
    resource = snippet.get("resourceId") or {}
    response = _execute(
        service.playlistItems().update(
            part="snippet",
            body={
                "id": playlist_item_id,
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {"kind": resource.get("kind") or "youtube#video", "videoId": resource.get("videoId")},
                    "position": position,
                },
            },
        ),
        "playlistItems.update",
        recorder,
    )
    return {"id": response.get("id") or playlist_item_id, "position": (response.get("snippet") or {}).get("position", position)}


def reorder_playlist_items(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_id: str,
    playlist_item_ids: list[str],
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    _owned_playlist(service, youtube_channel_id, playlist_id, recorder)
    wanted = list(dict.fromkeys(value for value in playlist_item_ids if value))
    current = []
    token = None
    while True:
        kwargs = {"part": "snippet", "playlistId": playlist_id, "maxResults": 50}
        if token:
            kwargs["pageToken"] = token
        response = _execute(service.playlistItems().list(**kwargs), "playlistItems.list", recorder)
        current.extend(response.get("items") or [])
        token = response.get("nextPageToken")
        if not token:
            break
    current_ids = [item.get("id") or "" for item in current]
    if len(wanted) != len(current_ids) or set(wanted) != set(current_ids):
        raise ValueError("playlist order must contain every current playlist item exactly once")
    by_id = {item.get("id"): item for item in current}
    working = list(current_ids)
    updated = 0
    for target_position, playlist_item_id in enumerate(wanted):
        current_position = working.index(playlist_item_id)
        if current_position == target_position:
            continue
        snippet = (by_id[playlist_item_id].get("snippet") or {})
        resource = snippet.get("resourceId") or {}
        _execute(
            service.playlistItems().update(
                part="snippet",
                body={
                    "id": playlist_item_id,
                    "snippet": {
                        "playlistId": playlist_id,
                        "resourceId": {
                            "kind": resource.get("kind") or "youtube#video",
                            "videoId": resource.get("videoId"),
                        },
                        "position": target_position,
                    },
                },
            ),
            "playlistItems.update",
            recorder,
        )
        working.pop(current_position)
        working.insert(target_position, playlist_item_id)
        updated += 1
    return {"ok": True, "playlistId": playlist_id, "updated": updated, "playlistItemIds": working}


def delete_playlist_item(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_id: str,
    playlist_item_id: str,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    _owned_playlist(service, youtube_channel_id, playlist_id, recorder)
    listed = _execute(
        service.playlistItems().list(part="snippet", id=playlist_item_id, maxResults=1),
        "playlistItems.list",
        recorder,
    ).get("items") or []
    if not listed or (listed[0].get("snippet") or {}).get("playlistId") != playlist_id:
        raise LookupError("playlist item does not belong to the selected playlist")
    _execute(service.playlistItems().delete(id=playlist_item_id), "playlistItems.delete", recorder)
    return {"ok": True, "playlistItemId": playlist_item_id}



def add_videos_to_playlist(
    refresh_token: str,
    youtube_channel_id: str,
    playlist_id: str,
    video_ids: list[str],
    recorder: QuotaRecorder | None = None,
) -> list[dict]:
    service = service_for(refresh_token)
    _owned_playlist(service, youtube_channel_id, playlist_id, recorder)
    out = []
    for video_id in dict.fromkeys(video_id for video_id in video_ids if video_id):
        response = _execute(
            service.playlistItems().insert(
                part="snippet",
                body={"snippet": {"playlistId": playlist_id, "resourceId": {"kind": "youtube#video", "videoId": video_id}}},
            ),
            "playlistItems.insert",
            recorder,
        )
        out.append({"playlistItemId": response.get("id") or "", "videoId": video_id})
    return out


def add_video_to_playlist(
    refresh_token: str,
    *,
    playlist_id: str,
    video_id: str,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    response = _execute(
        service.playlistItems().insert(
            part="snippet",
            body={
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {"kind": "youtube#video", "videoId": video_id},
                }
            },
        ),
        "playlistItems.insert",
        recorder,
    )
    return {
        "playlistItemId": response.get("id") or "",
        "playlistId": (response.get("snippet") or {}).get("playlistId") or playlist_id,
        "videoId": ((response.get("snippet") or {}).get("resourceId") or {}).get("videoId") or video_id,
    }


def remove_playlist_item(
    refresh_token: str,
    *,
    playlist_item_id: str,
    recorder: QuotaRecorder | None = None,
) -> None:
    service = service_for(refresh_token)
    _execute(
        service.playlistItems().delete(id=playlist_item_id),
        "playlistItems.delete",
        recorder,
    )



def set_video_thumbnail(
    refresh_token: str,
    youtube_video_id: str,
    data: bytes,
    content_type: str,
    recorder: QuotaRecorder | None = None,
) -> str:
    service = service_for(refresh_token)
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type, resumable=False)
    response = _execute(
        service.thumbnails().set(videoId=youtube_video_id, media_body=media),
        "thumbnails.set",
        recorder,
    )
    items = response.get("items") or []
    return _pick_thumb(items[0] if items else {})


def insert_video_caption(
    refresh_token: str,
    youtube_video_id: str,
    data: bytes,
    content_type: str,
    language: str,
    name: str,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = service_for(refresh_token)
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type, resumable=False)
    response = _execute(
        service.captions().insert(
            part="snippet",
            body={"snippet": {"videoId": youtube_video_id, "language": language, "name": name, "isDraft": False}},
            media_body=media,
        ),
        "captions.insert",
        recorder,
    )
    return {"id": response.get("id") or "", "status": (response.get("snippet") or {}).get("status") or ""}

def update_video_metadata(
    refresh_token: str,
    youtube_video_id: str,
    *,
    title: str,
    description: str,
    tags: list[str],
    category_id: str,
    language: str | None,
    made_for_kids: bool,
    recorder: QuotaRecorder | None = None,
) -> dict:
    service = build("youtube", "v3", credentials=creds_from_refresh(refresh_token))
    snippet = {
        "title": title,
        "description": description,
        "tags": tags,
        "categoryId": category_id,
    }
    if language:
        snippet["defaultLanguage"] = language
    current_response = _execute(
        service.videos().list(part="status", id=youtube_video_id),
        "videos.list",
        recorder,
    )
    current_items = current_response.get("items") or []
    if not current_items:
        raise RuntimeError("YouTube video status is unavailable")
    current_status = current_items[0].get("status") or {}
    mutable_status_fields = (
        "privacyStatus",
        "publishAt",
        "license",
        "embeddable",
        "publicStatsViewable",
        "containsSyntheticMedia",
    )
    status = {
        field: current_status[field]
        for field in mutable_status_fields
        if field in current_status
    }
    status["selfDeclaredMadeForKids"] = made_for_kids
    response = _execute(
        service.videos().update(
            part="snippet,status",
            body={"id": youtube_video_id, "snippet": snippet, "status": status},
        ),
        "videos.update",
        recorder,
    )
    returned = response.get("snippet") or snippet
    return {
        "youtube_title": returned.get("title") or "",
        "youtube_description": returned.get("description") or "",
        "youtube_tags": returned.get("tags") or [],
        "youtube_category_id": returned.get("categoryId") or category_id,
        "youtube_default_language": returned.get("defaultLanguage"),
        "youtube_made_for_kids": made_for_kids,
    }



def update_video_calendar_status(
    refresh_token: str,
    youtube_video_id: str,
    *,
    privacy_status: str,
    publish_at: str | None,
    recorder: QuotaRecorder | None = None,
) -> dict:
    """Update only YouTube publication state, preserving unrelated mutable status fields."""
    service = build("youtube", "v3", credentials=creds_from_refresh(refresh_token))
    current_response = _execute(
        service.videos().list(part="status", id=youtube_video_id),
        "videos.list",
        recorder,
    )
    items = current_response.get("items") or []
    if not items:
        raise LookupError("YouTube video status is unavailable")
    current_status = items[0].get("status") or {}
    status = {
        field: current_status[field]
        for field in (
            "license",
            "embeddable",
            "publicStatsViewable",
            "selfDeclaredMadeForKids",
            "containsSyntheticMedia",
        )
        if field in current_status
    }
    status["privacyStatus"] = privacy_status
    if publish_at:
        status["publishAt"] = publish_at
    response = _execute(
        service.videos().update(
            part="status",
            body={"id": youtube_video_id, "status": status},
        ),
        "videos.update",
        recorder,
    )
    returned = response.get("status") or status
    return {
        "privacy": returned.get("privacyStatus") or privacy_status,
        "publishAt": returned.get("publishAt"),
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
