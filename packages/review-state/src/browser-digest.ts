import { canonicalReviewJson } from "./canonical";
import type { ReviewDigest } from "./types";

export const browserReviewDigest: ReviewDigest = async (value) => {
  const bytes = new TextEncoder().encode(canonicalReviewJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
