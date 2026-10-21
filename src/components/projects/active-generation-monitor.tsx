"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { getActiveGenerationStatuses, type ActiveGeneration } from "@/app/[locale]/dashboard/generation-status-actions";
import { GenerationStatusIndicator } from "@/components/projects/generation-status-indicator";

export function ActiveGenerationMonitor({ initial, label }: { initial: ActiveGeneration[]; label: string }) {
  const [jobs, setJobs] = useState(initial);
  const router = useRouter();

  useEffect(() => {
    const active = jobs.filter(({ status }) => status === "queued" || status === "processing");
    if (!active.length) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      const latest = await getActiveGenerationStatuses(active.map(({ id }) => id));
      if (cancelled) return;
      setJobs(latest);
      if (latest.some(({ status }) => status === "succeeded" || status === "failed" || status === "reconciliation_required")) router.refresh();
    };
    const interval = window.setInterval(() => void poll(), 2500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [jobs, router]);

  const active = jobs.find(({ status }) => status === "queued" || status === "processing");
  if (!active) return null;
  return <GenerationStatusIndicator status={active.status} label={jobs.length > 1 ? `${label} (${jobs.length})` : label} onClick={() => router.push(`/dashboard/projects/${active.projectId}?generation=${active.id}`)} />;
}
