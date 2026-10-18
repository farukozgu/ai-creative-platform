"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PRESET_EVENT, type DashboardPresetSelection } from "@/components/dashboard/creative-preset-rail";
import { useRouter } from "@/i18n/navigation";
import { creationHref, resolveCreationEntry, type CreationEntry } from "./creation-entry";

export function CreationHomeEntry() {
  const t = useTranslations("Dashboard.creationWorkspace");
  const router = useRouter();
  const [entry, setEntry] = useState<CreationEntry>({ presetId: null, presentationMode: null });
  useEffect(() => {
    function handoff(event: Event) {
      const selection = (event as CustomEvent<DashboardPresetSelection>).detail;
      setEntry(resolveCreationEntry(selection.presetId, selection.presentationMode));
    }
    function legacyEntry() {
      if (window.location.hash === "#composer") router.replace("/dashboard/create");
    }
    legacyEntry();
    window.addEventListener("hashchange", legacyEntry);
    window.addEventListener(DASHBOARD_PRESET_EVENT, handoff);
    return () => {
      window.removeEventListener("hashchange", legacyEntry);
      window.removeEventListener(DASHBOARD_PRESET_EVENT, handoff);
    };
  }, [router]);
  return <Button href={creationHref(entry)}>{t("open")}</Button>;
}
