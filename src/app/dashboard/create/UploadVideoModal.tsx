"use client";

import { useState } from "react";
import {
  Button,
  Chips,
  Dropzone,
  FormSection,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { CATEGORIES, type Privacy, type PublishMode } from "@/types/publishing";
import { PublishingControls, toIso } from "./PublishingControls";
import { useUpload } from "./useUpload";

const PLAYLISTS = [{ value: "", label: "None" }];
const MAX_VIDEO_MB = 50;

export function UploadVideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { upload, progress, busy } = useUpload("/api/videos/upload");
  const [video, setVideo] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState("24");
  const [playlist, setPlaylist] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [mode, setMode] = useState<PublishMode>("now");
  const [publishAt, setPublishAt] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);

  const scheduleValid = mode === "now" || toIso(publishAt) !== null;
  const canSubmit = !!video && title.trim().length > 0 && scheduleValid;

  async function submit(draft: boolean) {
    if (!video || !title.trim()) return;
    if (draft) setDraftBusy(true);
    const fd = new FormData();
    fd.set("video", video);
    if (thumbnail) fd.set("thumbnail", thumbnail);
    fd.set("title", title.trim());
    fd.set("description", description.trim());
    fd.set("tags", JSON.stringify(tags));
    fd.set("category", category);
    if (playlist) fd.set("playlist", playlist);
    fd.set("privacy", privacy);
    fd.set("publishAt", (mode === "schedule" && toIso(publishAt)) || "");
    fd.set("draft", String(draft));

    const data = await upload(fd);
    setDraftBusy(false);
    if (data.ok) {
      toast.success(
        draft ? "Draft saved" : "Upload queued to publish",
        draft ? "Publish it later from the queue." : `Job ${data.jobId?.slice(0, 8)} is uploading to YouTube.`,
      );
      onClose();
    } else {
      toast.error("Upload failed", data.error);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="📤"
      title="Upload Existing Video"
      description="Upload a finished video with a thumbnail and metadata."
      footer={
        <>
          <Button variant="secondary" onClick={() => submit(true)} loading={draftBusy} disabled={!canSubmit || busy}>
            Save draft
          </Button>
          <Button onClick={() => submit(false)} loading={busy && !draftBusy} disabled={!canSubmit || busy || draftBusy}>
            Upload &amp; Publish
          </Button>
        </>
      }
    >
      <FormSection title="Video">
        <Dropzone
          label="Video file"
          kind="video"
          accept="video/mp4,video/quicktime,video/webm"
          file={video}
          onFile={setVideo}
          maxMB={MAX_VIDEO_MB}
          required
          progress={progress ?? undefined}
          hint="MP4, MOV or WebM"
        />
        <Dropzone
          label="Thumbnail (optional)"
          kind="image"
          accept="image/*"
          file={thumbnail}
          onFile={setThumbnail}
          maxMB={5}
          hint="PNG or JPG, 1280×720"
        />
      </FormSection>

      <FormSection title="Metadata">
        <Input
          label="Video title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="An attention-grabbing title"
          error={video && !title.trim() ? "Title is required." : null}
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={4900}
        />
        <Chips label="Tags" value={tags} onChange={setTags} placeholder="Add a tag…" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
          <Select label="Playlist" value={playlist} onChange={setPlaylist} options={PLAYLISTS} />
        </div>
      </FormSection>

      <FormSection title="Publishing">
        <PublishingControls
          privacy={privacy}
          onPrivacy={setPrivacy}
          mode={mode}
          onMode={setMode}
          publishAt={publishAt}
          onPublishAt={setPublishAt}
          scheduleError={!scheduleValid ? "Pick a valid date & time." : null}
        />
      </FormSection>
    </Modal>
  );
}
