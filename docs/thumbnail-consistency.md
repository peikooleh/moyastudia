# Playlist and video thumbnail consistency

## Playlist thumbnails

YouTube exposes two relevant resources with different roles:

- `playlistImages` is used to create/update a custom playlist image and to verify that the custom image resource exists.
- `playlists.snippet.thumbnails` is used for the displayable thumbnail URLs returned to MoyaStudia.

MoyaStudia therefore does not treat the upload response or a browser `blob:` preview as remote truth.

After a playlist thumbnail write the backend now:

1. verifies playlist ownership;
2. performs `playlistImages.insert` or `playlistImages.update`;
3. rereads `playlistImages.list` and requires the expected custom resource to be present;
4. rereads the channel playlist list from YouTube;
5. returns that fresh playlist state to the frontend.

The frontend replaces its playlist row from that reread state. The local file preview is only a draft before the write and is revoked after the request.

The playlist-image API contract is asymmetric: `playlistImages.list` can confirm that a custom `hero` image exists, but the resource does not expose a display URL. The current Google discovery schema also states that `contentDetails.thumbnailVideoId` is absent when a custom playlist thumbnail is set. MoyaStudia uses that signal to avoid presenting an older video-based `snippet.thumbnails` URL as if it were the current custom image.

A thumbnail changed directly in YouTube Studio is therefore detected as custom on the next remote playlist read, but its pixels cannot be fetched through the official Data API. In that state Studio shows an explicit “custom image set on YouTube; preview unavailable through the API” placeholder instead of a stale image. There is no separate playlist-thumbnail database cache.

## Video thumbnails

Video thumbnail URLs are stored in the local catalog because the video catalog itself is cached. The catalog sync maps the current `videos.list` thumbnail URL to `youtube_thumbnail_url` on every processed video, including already-known videos.

The 12-hour incremental scheduler walks the complete uploads catalog, so changes made directly in YouTube — including thumbnail URLs — are expected to replace the cached value without opening MoyaStudia. Manual refresh/reconcile remains the fallback.

Regression coverage explicitly asserts that an incremental sync updates the cached video thumbnail URL for an existing video.

## Known provider boundary

Playlist image writes use the current YouTube contract: `playlistImages.list` is filtered with `parent=<playlistId>`, and the main custom image type is `hero`. A verified custom image is never represented by a stale video-derived playlist thumbnail. Because `playlistImages` exposes metadata but no image URL, MoyaStudia cannot reconstruct the custom image preview after reload without using a non-official scraping/storage workaround; this branch intentionally does neither.

## Browser/CDN cache invalidation

YouTube can replace thumbnail bytes while keeping the same CDN URL. URL equality therefore does not prove that an image is unchanged.

MoyaStudia keeps the canonical YouTube thumbnail URL unchanged in storage, but appends a MoyaStudia-only version query parameter when returning a thumbnail for display:

- video thumbnails use the video's `last_synced_at` value, so every successful catalog refresh invalidates the browser image cache even when YouTube reused the URL;
- playlist thumbnails are read live rather than stored, so each playlist read gets a fresh display version; after a playlist thumbnail write the reread response is versioned the same way.

This query parameter is only a display cache key. It is never written back to YouTube and never replaces the canonical URL in the database.
