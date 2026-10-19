"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  type WorkspaceAsset,
  type WorkspaceAssetType,
  type WorkspaceGenerationState,
  type WorkspaceScenario,
  workspaceGenerationConfig,
} from "@/data/workspace-demo";
import { cn } from "@/lib/cn";

type WorkspaceCanvasProps = {
  scenario: WorkspaceScenario;
  selectedAssetId: string;
  generationState: WorkspaceGenerationState;
  layoutVersion: number;
  onAssetSelect: (assetId: string) => void;
};

type AssetMediaProps = {
  asset: WorkspaceAsset;
  alt?: string;
  allowPlayback?: boolean;
  loading?: "eager" | "lazy";
  sizes: string;
  fit?: "cover" | "contain";
};

function PlaybackIcon({ isPlaying = false }: { isPlaying?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
    >
      {isPlaying ? (
        <>
          <path d="M5 4.25v7.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M11 4.25v7.5" stroke="currentColor" strokeWidth="1.75" />
        </>
      ) : (
        <path d="m6 4 6 4-6 4V4Z" fill="currentColor" />
      )}
    </svg>
  );
}

function AssetMedia({
  asset,
  alt = "",
  allowPlayback = false,
  loading = "lazy",
  sizes,
  fit = "cover",
}: AssetMediaProps) {
  const t = useTranslations("WorkspaceDemo");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayableVideo =
    asset.type === "video" && Boolean(asset.src) && allowPlayback;
  const mediaSource = asset.type === "video" ? asset.poster : asset.src;

  useEffect(() => {
    const video = videoRef.current;

    if (!video || asset.type !== "video") {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!allowPlayback || prefersReducedMotion || !asset.autoPlay) {
      video.pause();
    } else {
      void video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      video.pause();
    };
  }, [allowPlayback, asset]);

  function togglePlayback() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }

  return (
    <>
      {isPlayableVideo && asset.type === "video" && asset.src ? (
        <video
          ref={videoRef}
          aria-label={alt || undefined}
          className={cn(
            "absolute inset-0 h-full w-full",
            fit === "contain" ? "object-contain" : "object-cover",
          )}
          loop={asset.loop}
          muted={asset.muted}
          playsInline
          poster={asset.poster}
          preload="metadata"
          src={asset.src}
          style={{ objectPosition: asset.objectPosition }}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      ) : (
        <Image
          fill
          alt={alt}
          className={fit === "contain" ? "object-contain" : "object-cover"}
          loading={loading}
          sizes={sizes}
          src={mediaSource}
          style={{ objectPosition: asset.objectPosition }}
        />
      )}

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-t from-[var(--workspace-media-shade)] via-transparent to-transparent"
      />

      {asset.type === "video" ? (
        isPlayableVideo ? (
          <button
            type="button"
            aria-label={
              isPlaying
                ? t("video.pause", { asset: t(asset.labelKey) })
                : t("video.play", { asset: t(asset.labelKey) })
            }
            className="absolute left-1/2 top-1/2 z-30 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[var(--workspace-video-control)] text-[var(--workspace-text)] shadow-[var(--shadow-subtle)] transition-transform duration-(--transition-fast) hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] motion-reduce:hover:scale-100 motion-reduce:transition-none"
            onClick={togglePlayback}
          >
            <PlaybackIcon isPlaying={isPlaying} />
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[var(--workspace-video-control)] text-[var(--workspace-text)]"
          >
            <PlaybackIcon />
          </span>
        )
      ) : null}
    </>
  );
}

function SelectionHandles() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-40"
    >
      <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full border border-[var(--workspace-canvas)] bg-[var(--accent)]" />
      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-[var(--workspace-canvas)] bg-[var(--accent)]" />
      <span className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full border border-[var(--workspace-canvas)] bg-[var(--accent)]" />
      <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full border border-[var(--workspace-canvas)] bg-[var(--accent)]" />
    </span>
  );
}

export function WorkspaceCanvas({
  scenario,
  selectedAssetId,
  generationState,
  layoutVersion,
  onAssetSelect,
}: WorkspaceCanvasProps) {
  const t = useTranslations("WorkspaceDemo");
  const selectedAsset =
    scenario.assets.find((asset) => asset.id === selectedAssetId) ??
    scenario.assets[0];
  const isGenerating =
    generationState !== "idle" && generationState !== "complete";
  const assetTypeLabels: Record<WorkspaceAssetType, string> = {
    input: t("assetTypes.input"),
    image: t("assetTypes.image"),
    video: t("assetTypes.video"),
  };

  return (
    <div className="min-w-0 bg-[var(--workspace-canvas)]">
      <div
        aria-label={t("canvasLabel")}
        role="group"
        className={cn(
          "relative hidden min-h-[32rem] overflow-hidden md:block md:aspect-[16/10] md:min-h-0 xl:h-full xl:aspect-auto",
          isGenerating && "workspace-canvas-generating",
        )}
      >
        {scenario.assets.map((asset, index) => {
          const isSelected = asset.id === selectedAssetId;
          const placement =
            layoutVersion % 2 === 0
              ? asset.position
              : asset.alternativePosition;

          return (
            <div
              key={`${scenario.id}-${layoutVersion}-${asset.id}`}
              className={cn(
                "workspace-asset-enter group absolute overflow-visible rounded-[var(--radius-sm)] transition-[opacity,filter] duration-(--workspace-transition) ease-(--button-transition-ease) motion-reduce:transition-none",
                isGenerating && "opacity-55 saturate-50",
              )}
              style={{
                animationDelay: `${index * workspaceGenerationConfig.assetStaggerMs}ms`,
                aspectRatio: asset.aspectRatio,
                left: `${placement.x}%`,
                top: `${placement.y}%`,
                transform: `rotate(${placement.rotate}deg)`,
                width: `${placement.width}%`,
                zIndex: placement.zIndex ?? index + 1,
              }}
            >
              <span
                className={cn(
                  "relative block h-full w-full overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--workspace-panel)] shadow-[var(--shadow-subtle)] transition-[border-color,box-shadow] duration-(--transition-fast) motion-reduce:transition-none",
                  isSelected
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--workspace-canvas)]"
                    : "border-[var(--workspace-line)] group-hover:border-[var(--workspace-line-strong)]",
                )}
              >
                <AssetMedia
                  asset={asset}
                  allowPlayback={isSelected}
                  loading={
                    isSelected || asset.type === "input" ? "eager" : "lazy"
                  }
                  sizes="(min-width: 1280px) 30vw, (min-width: 768px) 38vw, 70vw"
                />

                <span className="absolute bottom-2 left-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-[var(--radius)] bg-[var(--workspace-label)] px-2 py-1 text-[0.625rem] font-medium text-[var(--workspace-text)]">
                  {t(asset.labelKey)}
                </span>

                {isSelected ? (
                  <span className="absolute left-2 top-2 z-10 rounded-[var(--radius)] bg-[var(--accent)] px-2 py-1 text-[0.625rem] font-semibold text-[var(--surface)]">
                    {assetTypeLabels[asset.type]}
                  </span>
                ) : null}
              </span>

              <button
                type="button"
                aria-label={t("selectAsset", { asset: t(asset.altKey) })}
                aria-pressed={isSelected}
                className="absolute inset-0 z-20 rounded-[var(--radius-sm)] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onClick={() => onAssetSelect(asset.id)}
              />

              {isSelected ? <SelectionHandles /> : null}
            </div>
          );
        })}
      </div>

      <div className="p-3 md:hidden">
        <div
          aria-label={t("selectedPreviewLabel")}
          role="group"
          className={cn(
            "relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--workspace-line)] bg-[var(--workspace-panel)]",
            selectedAsset.type === "video" ? "aspect-[3/4]" : "aspect-[4/3]",
          )}
        >
          <AssetMedia
            asset={selectedAsset}
            alt={t(selectedAsset.altKey)}
            allowPlayback
            fit={selectedAsset.type === "video" ? "contain" : "cover"}
            loading="eager"
            sizes="(max-width: 767px) calc(100vw - 3.5rem), 50vw"
          />

          <span className="absolute left-3 top-3 z-10 rounded-[var(--radius)] bg-[var(--accent)] px-2 py-1 text-[0.625rem] font-semibold text-[var(--surface)]">
            {assetTypeLabels[selectedAsset.type]}
          </span>
          <span className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] truncate rounded-[var(--radius)] bg-[var(--workspace-label)] px-2 py-1 text-xs font-medium text-[var(--workspace-text)]">
            {t(selectedAsset.labelKey)}
          </span>
        </div>

        <div
          aria-label={t("assetListLabel")}
          className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2"
          role="group"
        >
          {scenario.assets.map((asset) => {
            const isSelected = asset.id === selectedAssetId;

            return (
              <button
                key={asset.id}
                type="button"
                aria-label={t("selectAsset", { asset: t(asset.altKey) })}
                aria-pressed={isSelected}
                className={cn(
                  "relative aspect-[4/3] w-28 shrink-0 snap-start overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--workspace-panel)] outline-offset-2 transition-[border-color,opacity] duration-(--transition-fast) focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none",
                  isSelected
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)]"
                    : "border-[var(--workspace-line)]",
                  isGenerating && "opacity-60",
                )}
                onClick={() => onAssetSelect(asset.id)}
              >
                <AssetMedia
                  asset={asset}
                  loading={
                    isSelected || asset.type === "input" ? "eager" : "lazy"
                  }
                  sizes="(max-width: 767px) 7rem, 0px"
                />
                {isSelected ? <SelectionHandles /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
