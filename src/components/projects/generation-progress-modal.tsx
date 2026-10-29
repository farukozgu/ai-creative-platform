"use client";

import { Button } from "@/components/ui/button";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { GenerationLoadingIndicator } from "@/components/projects/generation-loading-indicator";

type GenerationProgressModalProps = {
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  title: string;
  description: string;
  statuses: readonly [string, string, string, string];
};

export function GenerationProgressModal({ open, onClose, closeLabel, title, description, statuses }: GenerationProgressModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const portalRoot = typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => setStatusIndex((current) => (current + 1) % statuses.length), 2600);
    return () => window.clearInterval(interval);
  }, [open, statuses.length]);

  if (!open || !portalRoot) return null;
  return createPortal(<div className="generation-progress-overlay" onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.preventDefault()}>
    <div ref={dialogRef} className="generation-progress-modal" role="dialog" aria-modal="true" aria-labelledby="generation-progress-title" aria-describedby="generation-progress-description" tabIndex={-1}>
      <Button variant="icon" size="sm" type="button" className="generation-progress-close" aria-label={closeLabel} onClick={onClose}>×</Button>
      <GenerationLoadingIndicator />
      <h2 id="generation-progress-title">{title}</h2>
      <p id="generation-progress-description">{description}</p>
      <p className="generation-progress-status" aria-live="polite" aria-atomic="true">{statuses[statusIndex]}</p>
    </div>
  </div>, portalRoot);
}
