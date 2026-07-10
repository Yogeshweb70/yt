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
  Toggle,
  useToast,
} from "@/components/ui";
import {
  AUDIENCE_OPTIONS,
  CATEGORIES,
  LANGUAGE_OPTIONS,
  type Privacy,
  type PublishMode,
} from "@/types/publishing";
import { PublishingControls, toIso } from "./PublishingControls";
import { useUpload } from "./useUpload";

const PLAYLISTS = [{ value: "", label: "None" }];
const MAX_VIDEO_MB = 50;

export function ManualPublishModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { upload, progress, busy } = useUpload("/api/videos/upload");
  const [video, setVideo] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState("24");
  const [playlist, setPlaylist] = useState("");
  const [language, setLanguage] = useState("en");
  const [audience, setAudience] = useState("no");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [mode, setMode] = useState<PublishMode>("now");
  const [publishAt, setPublishAt] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [notifySubscribers, setNotifySubscribers] = useState(true);

  const scheduleValid = mode === "now" || toIso(publishAt) !== null;
  const canSubmit = !!video && title.trim().length > 0 && scheduleValid;

  async function submit() {
    if (!canSubmit || !video) return;
    const fd = new FormData();
    fd.set("video", video);
    if (thumbnail) fd.set("thumbnail", thumbnail);
    fd.set("title", title.trim());
    fd.set("description", description.trim());
    fd.set("tags", JSON.stringify(tags));
    fd.set("category", category);
    if (playlist) fd.set("playlist", playlist);
    fd.set("language", language);
    fd.set("audience", audience);
    fd.set("privacy", privacy);
    fd.set("publishAt", (mode === "schedule" && toIso(publishAt)) || "");
    fd.set("allowComments", String(allowComments));
    fd.set("notifySubscribers", String(notifySubscribers));
    fd.set("draft", "false");

    const data = await upload(fd);
    if (data.ok) {
      toast.success("Publishing video", `Job ${data.jobId?.slice(0, 8)} is uploading to YouTube.`);
      onClose();
    } else {
      toast.error("Publish failed", data.error);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="🚀"
      title="Manual Publish"
      description="Upload all assets and publish with full control."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit || busy}>
            Publish Video
          </Button>
        </>
      }
    >
      <FormSection title="Uploads">
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
          label="Thumbnail"
          kind="image"
          accept="image/*"
          file={thumbnail}
          onFile={setThumbnail}
          maxMB={5}
          hint="PNG or JPG, 1280×720"
        />
      </FormSection>

      <FormSection title="Video Details">
        <Input
          label="Video title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
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
          <Select label="Language" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
          <Select label="Audience" value={audience} onChange={setAudience} options={AUDIENCE_OPTIONS} />
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

      <FormSection title="Advanced">
        <Toggle
          checked={allowComments}
          onChange={setAllowComments}
          label="Allow comments"
          description="Viewers can comment on the video."
        />
        <Toggle
          checked={notifySubscribers}
          onChange={setNotifySubscribers}
          label="Notify subscribers"
          description="Send a notification on publish."
        />
      </FormSection>
    </Modal>
  );
}
