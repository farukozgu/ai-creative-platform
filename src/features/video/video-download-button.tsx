"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getVideoPlaybackAccessAction } from "@/app/[locale]/dashboard/video/generation-actions";

export function VideoDownloadButton({ jobId, label }: { jobId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const t = useTranslations("Dashboard.videoStudio.beta");
  async function download() {
    setBusy(true); setError(false);
    try {
      const result = await getVideoPlaybackAccessAction(jobId, true);
      if (result.status === "success") window.location.assign(result.url);
      else setError(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <span><Button variant="secondary" disabled={busy} onClick={() => { void download(); }}>{label}</Button>{error ? <small role="alert">{t("pollError")}</small> : null}</span>;
}
