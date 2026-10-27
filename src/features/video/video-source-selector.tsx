/* eslint-disable @next/next/no-img-element -- blob URLs and expiring authorized URLs are not image-optimizer inputs. */

import { useEffect, useRef, type ChangeEvent, type DragEvent } from "react";

import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import type {
  VideoLibraryAsset,
  VideoSource,
} from "@/features/video/video-studio-types";
import styles from "@/features/video/video-studio-workspace.module.css";

export type VideoLibraryStatus = "idle" | "loading" | "success" | "error";
export type IncomingVideoSourceStatus = "idle" | "loading" | "success" | "error";

type VideoSourceSelectorProps = {
  source: VideoSource | null;
  libraryAssets: VideoLibraryAsset[];
  libraryOpen: boolean;
  libraryStatus: VideoLibraryStatus;
  incomingStatus: IncomingVideoSourceStatus;
  copy: {
    heading: string;
    description: string;
    upload: string;
    replace: string;
    remove: string;
    chooseLibrary: string;
    closeLibrary: string;
    dropLabel: string;
    selectedAlt: string;
    localLabel: string;
    libraryLabel: string;
    fileMeta: (format: string, kilobytes: number) => string;
    libraryLoading: string;
    libraryEmpty: string;
    libraryError: string;
    retry: string;
    selectAsset: string;
    incomingLoading: string;
    incomingError: string;
  };
  onFile: (file: File) => void;
  onRemove: () => void;
  onToggleLibrary: () => void;
  onRetryLibrary: () => void;
  onSelectLibrary: (asset: VideoLibraryAsset) => void;
};

export function VideoSourceSelector({
  source,
  libraryAssets,
  libraryOpen,
  libraryStatus,
  incomingStatus,
  copy,
  onFile,
  onRemove,
  onToggleLibrary,
  onRetryLibrary,
  onSelectLibrary,
}: VideoSourceSelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (incomingStatus === "success" || incomingStatus === "error") sectionRef.current?.focus();
  }, [incomingStatus]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <section ref={sectionRef} className={styles.controlSection} aria-labelledby="video-source-heading" tabIndex={-1}>
      <div className={styles.controlHeading}>
        <h2 id="video-source-heading">{copy.heading}</h2>
        <p>{copy.description}</p>
      </div>

      {incomingStatus === "loading" ? (
        <p className={styles.incomingSourceState} role="status" aria-live="polite" aria-busy="true">
          {copy.incomingLoading}
        </p>
      ) : null}
      {incomingStatus === "error" ? (
        <p className={styles.incomingSourceState} role="alert" aria-live="assertive">
          {copy.incomingError}
        </p>
      ) : null}

      {source ? (
        <div className={styles.selectedSource}>
          <div className={styles.sourcePreview}>
            <img src={source.previewUrl} alt={copy.selectedAlt} />
          </div>
          <div className={styles.sourceCopy}>
            <span>{source.kind === "local" ? copy.localLabel : copy.libraryLabel}</span>
            <strong title={source.name}>{source.name}</strong>
            <small>
              {source.kind === "local"
                ? copy.fileMeta(
                    source.mimeType.replace("image/", "").toUpperCase(),
                    Math.max(1, Math.round(source.size / 1024)),
                  )
                : source.aspectRatio || "—"}
            </small>
          </div>
          <div className={styles.sourceActions}>
            <button type="button" onClick={() => inputRef.current?.click()}>
              {copy.replace}
            </button>
            <button type="button" onClick={onRemove}>{copy.remove}</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.sourceDropzone}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <DashboardIcon name="image" />
          <strong>{copy.upload}</strong>
          <span>{copy.dropLabel}</span>
        </button>
      )}

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png"
        aria-label={source ? copy.replace : copy.upload}
        onChange={chooseFile}
      />

      <button
        type="button"
        className={styles.libraryToggle}
        aria-expanded={libraryOpen}
        aria-controls="video-source-library"
        onClick={onToggleLibrary}
      >
        <DashboardIcon name="projects" />
        <span>{libraryOpen ? copy.closeLibrary : copy.chooseLibrary}</span>
      </button>

      {libraryOpen ? (
        <div
          id="video-source-library"
          className={styles.libraryPanel}
          aria-live="polite"
          aria-busy={libraryStatus === "loading"}
        >
          {libraryStatus === "loading" ? (
            <p className={styles.libraryState}>{copy.libraryLoading}</p>
          ) : null}
          {libraryStatus === "error" ? (
            <div className={styles.libraryState} role="alert">
              <p>{copy.libraryError}</p>
              <button type="button" onClick={onRetryLibrary}>{copy.retry}</button>
            </div>
          ) : null}
          {libraryStatus === "success" && libraryAssets.length === 0 ? (
            <p className={styles.libraryState}>{copy.libraryEmpty}</p>
          ) : null}
          {libraryStatus === "success" && libraryAssets.length > 0 ? (
            <div className={styles.libraryGrid}>
              {libraryAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={`${copy.selectAsset}: ${asset.name}`}
                  aria-pressed={source?.kind === "library" && source.id === asset.id}
                  onClick={() => onSelectLibrary(asset)}
                >
                  <img src={asset.previewUrl} alt="" />
                  <span>{asset.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
