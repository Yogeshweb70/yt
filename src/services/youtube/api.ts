import "server-only";

const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const DATA = "https://www.googleapis.com/youtube/v3";

/** Thrown when the daily API quota is (or would be) exhausted — retry next window. */
export class QuotaError extends Error {}
/** Thrown for permanent failures (e.g. invalid metadata) — do not retry. */
export class NonRetryableError extends Error {}

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  language: string;
  madeForKids: boolean;
  privacyStatus: "public" | "private" | "unlisted";
  publishAt?: string | null; // ISO; forces privacyStatus=private until then
}

async function classify(res: Response): Promise<never> {
  const body = await res.text();
  if (res.status === 403 && /quota/i.test(body)) {
    throw new QuotaError(`quota exceeded: ${body}`);
  }
  if (res.status === 400 || res.status === 401) {
    // 401 (token) is refreshed upstream; a fresh 401 here means bad creds.
    throw new NonRetryableError(`youtube ${res.status}: ${body}`);
  }
  throw new Error(`youtube ${res.status}: ${body}`);
}

/** Resumable upload of an MP4 (fetched from its R2 URL). Returns the video id. */
export async function uploadVideo(
  accessToken: string,
  videoUrl: string,
  meta: VideoMetadata,
): Promise<string> {
  const media = await fetch(videoUrl);
  if (!media.ok) throw new Error(`fetch video failed: ${media.status}`);
  const bytes = Buffer.from(await media.arrayBuffer());

  const snippet = {
    snippet: {
      title: meta.title.slice(0, 100),
      description: meta.description.slice(0, 4900),
      tags: meta.tags,
      categoryId: meta.categoryId,
      defaultLanguage: meta.language,
      defaultAudioLanguage: meta.language,
    },
    status: {
      privacyStatus: meta.publishAt ? "private" : meta.privacyStatus,
      publishAt: meta.publishAt ?? undefined,
      selfDeclaredMadeForKids: meta.madeForKids,
      license: "youtube",
      embeddable: true,
    },
  };

  const init = await fetch(
    `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: JSON.stringify(snippet),
    },
  );
  if (!init.ok) await classify(init);
  const session = init.headers.get("location");
  if (!session) throw new Error("no resumable session URL returned");

  const put = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) },
    body: bytes,
  });
  if (!put.ok) await classify(put);
  const json = (await put.json()) as { id?: string };
  if (!json.id) throw new Error("upload succeeded but no video id returned");
  return json.id;
}

/** Uploads a custom thumbnail image (fetched from its R2 URL). */
export async function setThumbnail(
  accessToken: string,
  videoId: string,
  thumbnailUrl: string,
): Promise<void> {
  const img = await fetch(thumbnailUrl);
  if (!img.ok) throw new Error(`fetch thumbnail failed: ${img.status}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  const res = await fetch(`${UPLOAD}/thumbnails/set?videoId=${videoId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
    body: bytes,
  });
  if (!res.ok) await classify(res);
}

/** Adds a video to a playlist. */
export async function addToPlaylist(
  accessToken: string,
  playlistId: string,
  videoId: string,
): Promise<void> {
  const res = await fetch(`${DATA}/playlistItems?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });
  if (!res.ok) await classify(res);
}
