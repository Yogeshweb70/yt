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
  CATEGORIES,
  type AiGeneratePayload,
  type Privacy,
  type PublishMode,
} from "@/types/publishing";
import { PublishingControls, toIso } from "./PublishingControls";

const PLAYLISTS = [{ value: "", label: "None" }]; // wire real playlists when available

export function AiVideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState("24");
  const [playlist, setPlaylist] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [mode, setMode] = useState<PublishMode>("now");
  const [publishAt, setPublishAt] = useState("");
  const [autoTitle, setAutoTitle] = useState(true);
  const [autoDescription, setAutoDescription] = useState(true);
  const [autoThumbnail, setAutoThumbnail] = useState(true);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [busy, setBusy] = useState<"publish" | "draft" | null>(null);

  const hasContent = topic.trim().length > 0 || script.trim().length > 0;
  const scheduleValid = mode === "now" || toIso(publishAt) !== null;

  async function submit(draft: boolean) {
    if (!hasContent) return;
    setBusy(draft ? "draft" : "publish");
    const payload: AiGeneratePayload = {
      topic: topic.trim() || undefined,
      script: script.trim() || undefined,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      tags,
      categoryId: category,
      playlistId: playlist || undefined,
      privacy,
      publishAt: mode === "schedule" ? toIso(publishAt) : null,
      autoTitle,
      autoDescription,
      autoThumbnail,
      draft,
    };
    try {
      const res = await fetch("/api/pipeline/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (data.ok) {
        toast.success(
          draft ? "Draft queued" : "AI video queued",
          `Job ${data.jobId?.slice(0, 8)} — a worker will generate & ${draft ? "hold it as draft" : "publish it"}.`,
        );
        onClose();
      } else {
        toast.error("Failed to queue", data.error);
      }
    } catch (e) {
      toast.error("Failed to queue", e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="🎬"
      title="Create AI Video"
      description="Generate a complete video from a topic or a full script."
      size="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => submit(true)} loading={busy === "draft"} disabled={!hasContent || busy !== null}>
            Save draft
          </Button>
          <Button onClick={() => submit(false)} loading={busy === "publish"} disabled={!hasContent || !scheduleValid || busy !== null}>
            Generate &amp; Publish
          </Button>
        </>
      }
    >
      <FormSection title="AI Content">
        <Textarea
          label="Video topic"
          placeholder="e.g. The science of why we procrastinate"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
          maxLength={300}
          hint="A short prompt — AI expands it into a full script."
        />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-white/10" /> OR <span className="h-px flex-1 bg-white/10" />
        </div>
        <Textarea
          label="Full script"
          placeholder="Paste a complete script to narrate verbatim…"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={5}
          maxLength={5000}
          hint="Provide either a topic or a script."
          error={!hasContent ? "Enter a topic or a script to continue." : null}
        />
      </FormSection>

      <FormSection title="Media">
        <Toggle
          checked={autoThumbnail}
          onChange={setAutoThumbnail}
          label="Auto-generate thumbnail"
          description="Let AI design the thumbnail."
        />
        {!autoThumbnail && (
          <Dropzone
            label="Custom thumbnail"
            kind="image"
            accept="image/*"
            file={thumbnail}
            onFile={setThumbnail}
            maxMB={5}
            hint="PNG or JPG, 1280×720"
          />
        )}
      </FormSection>

      <FormSection title="Metadata">
        <Input
          label="Video title"
          placeholder="Leave blank to auto-generate"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          disabled={autoTitle}
          hint={autoTitle ? "Auto-generate is on." : undefined}
        />
        <Textarea
          label="Description"
          placeholder="Leave blank to auto-generate"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={4900}
          disabled={autoDescription}
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

      <FormSection title="AI Options">
        <Toggle checked={autoTitle} onChange={setAutoTitle} label="Auto-generate title" />
        <Toggle checked={autoDescription} onChange={setAutoDescription} label="Auto-generate description" />
        <Toggle checked={autoThumbnail} onChange={setAutoThumbnail} label="Auto-generate thumbnail" />
      </FormSection>
    </Modal>
  );
}
