"use client";

import { useCallback, useRef, useState } from "react";
import type { ToastMessage, ToastTone } from "@/components/Toast";

/**
 * Single-slot toast queue. A new message replaces the current one rather than
 * stacking, which keeps the announcement region predictable for screen readers
 * and avoids a pile-up when several models finish at once.
 */
export function useToasts() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(0);

  const push = useCallback((text: string, tone: ToastTone = "info") => {
    nextId.current += 1;
    setToast({ id: nextId.current, tone, text });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, push, dismiss };
}
