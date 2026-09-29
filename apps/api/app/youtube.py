from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from .settings import settings

SCOPES = [
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
]


def _flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )


def authorization_url() -> str:
    flow = _flow()
    url, _state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return url


def exchange_code(code: str) -> Credentials:
    flow = _flow()
    flow.fetch_token(code=code)
    return flow.credentials


def creds_from_refresh(refresh_token: str) -> Credentials:
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
    )


def service_for(refresh_token: str):
    return build("youtube", "v3", credentials=creds_from_refresh(refresh_token))


def fetch_channel(creds: Credentials) -> dict:
    service = build("youtube", "v3", credentials=creds)
    resp = service.channels().list(part="snippet,contentDetails", mine=True).execute()
    items = resp.get("items") or []
    if not items:
        return {"youtube_channel_id": "", "title": "", "uploads": ""}
    item = items[0]
    uploads = (
        item.get("contentDetails", {})
        .get("relatedPlaylists", {})
        .get("uploads", "")
    )
    return {
        "youtube_channel_id": item["id"],
        "title": item["snippet"]["title"],
        "uploads": uploads,
    }


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


def list_videos(refresh_token: str) -> list[dict]:
    service = service_for(refresh_token)
    ch = service.channels().list(part="contentDetails", mine=True).execute()
    items = ch.get("items") or []
    if not items:
        return []
    uploads = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

    video_ids = []
    token = None
    while True:
        resp = service.playlistItems().list(
            part="contentDetails",
            playlistId=uploads,
            maxResults=50,
            pageToken=token,
        ).execute()
        for item in resp.get("items") or []:
            vid = item.get("contentDetails", {}).get("videoId")
            if vid:
                video_ids.append(vid)
        token = resp.get("nextPageToken")
        if not token or len(video_ids) >= 150:
            break

    videos = []
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i : i + 50]
        resp = service.videos().list(
            part="snippet,status",
            id=",".join(chunk),
        ).execute()
        for item in resp.get("items") or []:
            snippet = item.get("snippet") or {}
            status = item.get("status") or {}
            privacy = status.get("privacyStatus") or "private"
            publish_at = status.get("publishAt") or ""
            if publish_at.endswith("Z"):
                publish_at = publish_at[:-1]
            if publish_at and "T" in publish_at:
                publish_at = publish_at[:16]
            tags = snippet.get("tags") or []
            videos.append(
                {
                    "id": item["id"],
                    "youtubeId": item["id"],
                    "title": snippet.get("title") or "",
                    "description": snippet.get("description") or "",
                    "tags": ", ".join(tags),
                    "category": snippet.get("categoryId") or "",
                    "playlist": "",
                    "language": snippet.get("defaultLanguage")
                    or snippet.get("defaultAudioLanguage")
                    or "",
                    "privacy": privacy,
                    "slot": publish_at,
                    "status": "scheduled" if publish_at else privacy,
                    "thumb": (snippet.get("thumbnails") or {}).get("medium", {}).get("url")
                    or "",
                }
            )
    return videos
