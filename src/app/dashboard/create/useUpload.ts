"use client";

import { useCallback, useState } from "react";

interface UploadResult {
  ok: boolean;
  videoId?: string;
  jobId?: string;
  draft?: boolean;
  error?: string;
}

/**
 * Multipart upload with real progress via XMLHttpRequest (fetch can't report
 * upload progress). Returns `progress` (0–100) and an `upload(formData)` call.
 */
export function useUpload(url: string) {
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    (formData: FormData): Promise<UploadResult> =>
      new Promise((resolve) => {
        setBusy(true);
        setProgress(0);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          setBusy(false);
          try {
            resolve(JSON.parse(xhr.responseText) as UploadResult);
          } catch {
            resolve({ ok: false, error: `unexpected response (${xhr.status})` });
          }
        };
        xhr.onerror = () => {
          setBusy(false);
          resolve({ ok: false, error: "network error during upload" });
        };
        xhr.send(formData);
      }),
    [url],
  );

  return { upload, progress, busy, reset: () => setProgress(null) };
}
