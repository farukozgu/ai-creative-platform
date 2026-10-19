"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DASHBOARD_PRESET_EVENT, type DashboardPresetSelection } from "@/components/dashboard/creative-preset-rail";
import { Link, useRouter } from "@/i18n/navigation";
import { creationHref, resolveCreationEntry, type CreationEntry } from "./creation-entry";

export function CreationHomeEntry({ children, className }: { children: ReactNode; className: string }) {
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
  return <Link href={creationHref(entry)} className={className}>{children}</Link>;
}
