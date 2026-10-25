"use client";

import { useState } from "react";
import { ProjectImageViewer } from "@/components/projects/project-image-viewer";
import { ImageDownloadButton } from "@/components/projects/image-download-button";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Link } from "@/i18n/navigation";
import type { DashboardGeneration } from "@/lib/generations/get-dashboard-generations";
import { FavoriteButton } from "@/components/ui/favorite-button";
import type { FavoriteGenerationResult } from "@/lib/generations/favorite-generation";

type Messages = {
  heading: string;
  emptyHeading: string;
  emptyDescription: string;
  start: string;
  untitled: string;
  previewAlt: string;
  fullscreen: string;
  project: string;
  edit: string;
  closeFullscreen: string;
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
  favoriteAdd: string;
  favoriteRemove: string;
  favoriteError: string;
  galleryLabel: string;
  viewAll: string;
};

export function RecentGenerationsGallery({ generations, messages, locale, favoriteAction }: { generations: DashboardGeneration[]; messages: Messages; locale: string; favoriteAction: (generationId: string, nextValue: boolean) => Promise<FavoriteGenerationResult> }) {
  const [generationItems, setGenerationItems] = useState(generations);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoriteError, setFavoriteError] = useState(false);
  const completed = generationItems.filter((generation) => generation.status === "succeeded" && generation.type === "image" && generation.previewUrl);
  const [viewerGenerationId, setViewerGenerationId] = useState<string | null>(null);
  const [menuGenerationId, setMenuGenerationId] = useState<string | null>(null);
  const viewerGeneration = completed.find((generation) => generation.id === viewerGenerationId) ?? null;
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  async function toggleFavorite(generation: DashboardGeneration) {
    if (pendingFavoriteIds.has(generation.id)) return;
    const nextValue = !generation.isFavorite;
    setFavoriteError(false);
    setGenerationItems((current) => current.map((item) => item.id === generation.id ? { ...item, isFavorite: nextValue } : item));
    setPendingFavoriteIds((current) => new Set(current).add(generation.id));
    let failed = false;
    try {
      const result = await favoriteAction(generation.id, nextValue);
      failed = result.status === "error";
    } catch {
      failed = true;
    }
    if (failed) {
      setGenerationItems((current) => current.map((item) => item.id === generation.id ? { ...item, isFavorite: generation.isFavorite } : item));
      setFavoriteError(true);
    }
    setPendingFavoriteIds((current) => { const next = new Set(current); next.delete(generation.id); return next; });
  }

  return <section className="dashboard-content-section" aria-labelledby="recent-generations-title">
    <div className="dashboard-section-heading dashboard-gallery-heading"><h2 id="recent-generations-title">{messages.heading}</h2><Link href="/dashboard/projects">{messages.viewAll}<DashboardIcon name="arrow" /></Link></div>
    {favoriteError ? <p className="favorite-feedback" role="alert">{messages.favoriteError}</p> : null}
    {completed.length === 0 ? <div className="dashboard-empty-state"><div className="dashboard-empty-mark" aria-hidden="true"><DashboardIcon name="assets" /></div><div><h3>{messages.emptyHeading}</h3><p>{messages.emptyDescription}</p></div><Link href="/dashboard/create" className="dashboard-view-all-button">{messages.start}</Link></div> :
      <ul className="dashboard-generation-grid" data-count={Math.min(completed.length, 6)} aria-label={messages.galleryLabel}>{completed.map((generation) => {
        const title = generation.projectTitle?.trim() || messages.untitled;
        const alt = messages.previewAlt.replace("{title}", title);
        const date = new Date(generation.createdAt);
        const formattedDate = dateFormatter.format(date);
        const formatLabel = generation.aspectRatio ? ` · ${generation.aspectRatio}` : "";
        const projectHref = `/dashboard/projects/${generation.projectId}?generation=${encodeURIComponent(generation.id)}`;
        return <li key={generation.id} className="dashboard-generation-item">
          <article className="dashboard-generation-card">
            <Link className="dashboard-generation-card-link" href={projectHref} aria-label={`${messages.project}: ${title}`} />
            <div className="dashboard-generation-media">
              {/* Private signed Storage URLs bypass Next's public image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={generation.previewUrl as string} alt={alt} loading="lazy" />
              <FavoriteButton active={generation.isFavorite} disabled={pendingFavoriteIds.has(generation.id)} className="dashboard-generation-favorite" label={generation.isFavorite ? messages.favoriteRemove : messages.favoriteAdd} onClick={() => void toggleFavorite(generation)} />
              <div className="dashboard-generation-actions" aria-label={title}>
                <button type="button" aria-label={`${messages.fullscreen}: ${title}`} onClick={() => setViewerGenerationId(generation.id)}>{messages.fullscreen}</button>
                <Link href={`/dashboard/projects/${generation.projectId}?generation=${encodeURIComponent(generation.id)}#project-controls-heading`}>{messages.edit}</Link>
              </div>
              <button type="button" className="dashboard-generation-menu-trigger" aria-label={`${messages.project}: ${title}`} aria-expanded={menuGenerationId === generation.id} onClick={() => setMenuGenerationId((current) => current === generation.id ? null : generation.id)}><DashboardIcon name="menu" /></button>
              {menuGenerationId === generation.id ? <div className="dashboard-generation-mobile-menu">
                <button type="button" onClick={() => { setViewerGenerationId(generation.id); setMenuGenerationId(null); }}>{messages.fullscreen}</button>
                <Link href={`/dashboard/projects/${generation.projectId}?generation=${encodeURIComponent(generation.id)}#project-controls-heading`}>{messages.edit}</Link>
              </div> : null}
            </div>
            <div className="dashboard-generation-copy"><strong>{title}</strong><time dateTime={generation.createdAt}>{formattedDate}{formatLabel}</time></div>
          </article>
        </li>;
      })}</ul>}
    {viewerGeneration?.previewUrl ? <ProjectImageViewer src={viewerGeneration.previewUrl} alt={messages.previewAlt.replace("{title}", viewerGeneration.projectTitle?.trim() || messages.untitled)} open closeLabel={messages.closeFullscreen} zoomInLabel={messages.zoomIn} zoomOutLabel={messages.zoomOut} resetLabel={messages.resetZoom} downloadControl={<ImageDownloadButton key={viewerGeneration.id} generationId={viewerGeneration.id} />} onOpenChange={(open) => { if (!open) setViewerGenerationId(null); }} /> : null}
  </section>;
}
