"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

const storageKey = "agentic-ops-approval-drafts-v1";
export const approvalDraftSchema = z.object({
  subject: z.string().trim().min(1, "Add a subject before saving.").max(200, "Keep the subject under 200 characters."),
  body: z.string().trim().min(10, "Add a message of at least 10 characters.").max(10000, "Keep the message under 10,000 characters."),
});
export type ApprovalDraft = z.infer<typeof approvalDraftSchema>;
const storedDraftsSchema = z.record(z.string(), approvalDraftSchema);

export function useApprovalDrafts() {
  const [drafts, setDrafts] = useState<Record<string, ApprovalDraft>>({});
  const [storageAvailable, setStorageAvailable] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect -- Restore optional browser-only draft edits after hydration. */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = storedDraftsSchema.safeParse(JSON.parse(stored));
        if (parsed.success) setDrafts(parsed.data);
      }
    } catch { setStorageAvailable(false); }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function saveDraft(id: string, draft: ApprovalDraft) {
    const next = { ...drafts, [id]: approvalDraftSchema.parse(draft) };
    setDrafts(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageAvailable(true);
    } catch { setStorageAvailable(false); }
  }

  return { drafts, saveDraft, storageAvailable };
}
