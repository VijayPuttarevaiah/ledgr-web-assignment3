/**
 * §4.3 — client-visible mirrors, used ONLY to decide whether an AI entry
 * point renders at all. Never treated as authorization: every route this
 * gates independently re-runs the real server-side resolution in
 * `resolveAIFeature` before doing any work.
 */
const master = process.env.NEXT_PUBLIC_AI_FEATURES_ENABLED === "true";

export const aiClientFlags = {
  master,
  categorization: master && process.env.NEXT_PUBLIC_AI_CATEGORIZATION_ENABLED === "true",
  ocr: master && process.env.NEXT_PUBLIC_AI_OCR_ENABLED === "true",
  narrative: master && process.env.NEXT_PUBLIC_AI_NARRATIVE_ENABLED === "true",
};
