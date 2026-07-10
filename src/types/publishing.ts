/** Shared publishing option types + option lists for the Create-a-Video UI
 *  and the API routes that consume them. Keep client-safe (no server imports). */

export type Privacy = "public" | "unlisted" | "private";
export type PublishMode = "now" | "schedule";

/** YouTube standard category ids (subset most relevant to Shorts). */
export const CATEGORIES: { value: string; label: string }[] = [
  { value: "24", label: "Entertainment" },
  { value: "22", label: "People & Blogs" },
  { value: "27", label: "Education" },
  { value: "28", label: "Science & Technology" },
  { value: "20", label: "Gaming" },
  { value: "10", label: "Music" },
  { value: "17", label: "Sports" },
  { value: "23", label: "Comedy" },
  { value: "25", label: "News & Politics" },
  { value: "26", label: "Howto & Style" },
];

export const PRIVACY_OPTIONS: { value: Privacy; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can watch" },
  { value: "unlisted", label: "Unlisted", hint: "Only with the link" },
  { value: "private", label: "Private", hint: "Only you" },
];

export const AUDIENCE_OPTIONS = [
  { value: "no", label: "Not made for kids" },
  { value: "yes", label: "Made for kids" },
];

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
];

/** Payload sent to POST /api/pipeline/trigger for the AI generator. */
export interface AiGeneratePayload {
  topic?: string;
  script?: string;
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  playlistId?: string;
  privacy: Privacy;
  publishAt?: string | null;
  autoTitle: boolean;
  autoDescription: boolean;
  autoThumbnail: boolean;
  draft?: boolean;
}
