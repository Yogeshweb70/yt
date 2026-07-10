"use client";

import { useState } from "react";
import { ToastProvider } from "@/components/ui";
import { AiVideoModal } from "./AiVideoModal";
import { UploadVideoModal } from "./UploadVideoModal";
import { ManualPublishModal } from "./ManualPublishModal";

type ModalKey = "ai" | "upload" | "manual" | null;

interface CardDef {
  key: Exclude<ModalKey, null>;
  icon: string;
  title: string;
  description: string;
  cta: string;
  gradient: string; // decorative glow behind the icon
}

const CARDS: CardDef[] = [
  {
    key: "ai",
    icon: "🎬",
    title: "Create AI Video",
    description:
      "Generate a complete video from a topic or a detailed script. AI handles the video, title, description, thumbnail, and publishing.",
    cta: "Generate Video",
    gradient: "from-primary/30 to-fuchsia-500/20",
  },
  {
    key: "upload",
    icon: "📤",
    title: "Upload Existing Video",
    description:
      "Already have a finished video? Upload it with a thumbnail and metadata, then publish it instantly.",
    cta: "Upload Video",
    gradient: "from-sky-500/25 to-cyan-400/15",
  },
  {
    key: "manual",
    icon: "🚀",
    title: "Manual Publish",
    description: "Manually upload all assets and publish the video with full control.",
    cta: "Publish Manually",
    gradient: "from-amber-500/25 to-orange-500/15",
  },
];

export function CreateVideoSection() {
  const [modal, setModal] = useState<ModalKey>(null);

  return (
    <ToastProvider>
      <section className="mb-8">
        <h2 className="text-xl font-bold text-foreground">Create a Video</h2>
        <p className="mt-1 text-sm text-muted">
          Generate videos with AI, upload existing videos, or publish manually.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {CARDS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setModal(c.key)}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-black/40"
            >
              {/* Decorative gradient glow */}
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${c.gradient} opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70`}
              />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-2xl shadow-inner ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110">
                {c.icon}
              </div>
              <h3 className="relative mt-4 text-base font-semibold text-foreground">{c.title}</h3>
              <p className="relative mt-1.5 flex-1 text-sm leading-relaxed text-muted">
                {c.description}
              </p>
              <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-all group-hover:gap-2.5">
                {c.cta}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </section>

      <AiVideoModal open={modal === "ai"} onClose={() => setModal(null)} />
      <UploadVideoModal open={modal === "upload"} onClose={() => setModal(null)} />
      <ManualPublishModal open={modal === "manual"} onClose={() => setModal(null)} />
    </ToastProvider>
  );
}
