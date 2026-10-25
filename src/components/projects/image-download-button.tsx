"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { downloadGeneratedImage } from "@/app/[locale]/dashboard/download-actions";

export function ImageDownloadButton({ generationId }: { generationId: string }) {
  const t = useTranslations("Dashboard.project.outputs");
  const locale = useLocale();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      const result = await downloadGeneratedImage(locale, generationId);
      if (!result.ok) { setFailed(true); return; }
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.fileName;
      link.referrerPolicy = "no-referrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <span className="image-download-control">
    <Button variant="ghost" size="sm" disabled={pending} aria-busy={pending} onClick={() => void download()}>
      {t(pending ? "downloadPending" : "download")}
    </Button>
    {failed ? <span role="alert">{t("downloadError")}</span> : null}
  </span>;
}
