"use client";

import { useRef, useState, useId } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { deleteVideoAction } from "@/app/[locale]/dashboard/video/delete-actions";

export function VideoDeleteButton({ jobId, title, disabled }: {
  jobId: string; title: string; disabled: boolean;
}) {
  const t = useTranslations("Dashboard.videoLibrary.deletion");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const heading = useId();
  const description = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"error" | "busy" | null>(null);
  async function remove() {
    setBusy(true); setError(null);
    try {
      const result = await deleteVideoAction(jobId);
      if (result.status === "success") { dialog.current?.close(); router.replace("/dashboard/videos"); router.refresh(); }
      else setError(result.status);
    } catch { setError("error"); }
    finally { setBusy(false); }
  }
  return <>
    <Button ref={trigger} variant="outline" size="md" disabled={disabled} title={disabled ? t("busy") : undefined} aria-label={t("label", { title })}
      onClick={() => { setError(null); dialog.current?.showModal(); }}>{t("delete")}</Button>
    <dialog ref={dialog} className="delete-project-dialog" aria-labelledby={heading} aria-describedby={description}
      onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <div className="delete-project-dialog-content">
        <h2 id={heading}>{t("title")}</h2>
        <p id={description}>{t("description", { title })}</p>
        {error ? <p role="alert">{t(error)}</p> : null}
        <div className="delete-project-dialog-actions">
          <Button variant="secondary" size="sm" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>{t("cancel")}</Button>
          <Button variant="destructive" size="sm" loading={busy} loadingLabel={t("deleting")} onClick={() => void remove()}>{t("delete")}</Button>
        </div>
      </div>
    </dialog>
  </>;
}
