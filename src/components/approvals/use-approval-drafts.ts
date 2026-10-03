"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { approvalMessageSchema } from "@/lib/validation/approval";

const storageKey = "agentic-ops-demo-approval-drafts-v09";
export const approvalDraftSchema = approvalMessageSchema;
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
