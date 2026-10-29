import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  VideoSourceSelector,
  type IncomingVideoSourceStatus,
  type VideoLibraryStatus,
} from "@/features/video/video-source-selector";
import type {
  VideoAspectRatio,
  VideoDuration,
  VideoLibraryAsset,
  VideoQuality,
  VideoSource,
} from "@/features/video/video-studio-types";
import styles from "@/features/video/video-studio-workspace.module.css";

type Option<T extends string | number> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type VideoInspectorCopy = {
  title: string;
  description: string;
  source: Parameters<typeof VideoSourceSelector>[0]["copy"];
  promptHeading: string;
  promptDescription: string;
  promptPlaceholder: string;
  qualityHeading: string;
  outputHeading: string;
  aspectRatioLabel: string;
  durationLabel: string;
  secondsLabel: (seconds: number) => string;
  generate: string;
  libraryLink: string;
  approvalHeading: string;
};

type VideoGenerationInspectorProps = {
  approvalControls?: React.ReactNode;
  costSummary?: React.ReactNode;
  referenceControls?: React.ReactNode;
  presetControls?: React.ReactNode;
  directorControls?: React.ReactNode;
  advancedSettings?: React.ReactNode;
  preservationControls?: React.ReactNode;
  copy: VideoInspectorCopy;
  source: VideoSource | null;
  prompt: string;
  quality: VideoQuality;
  qualityOptions: Option<VideoQuality>[];
  aspectRatio: VideoAspectRatio;
  aspectRatioOptions: Option<VideoAspectRatio>[];
  duration: VideoDuration;
  durationOptions: Option<VideoDuration>[];
  feedbackMessage: string | null;
  feedbackIsError: boolean;
  isReady: boolean;
  isSubmitting: boolean;
  showLibraryLink: boolean;
  generationAvailable: boolean;
  libraryAssets: VideoLibraryAsset[];
  libraryOpen: boolean;
  libraryStatus: VideoLibraryStatus;
  incomingSourceStatus: IncomingVideoSourceStatus;
  onFile: (file: File) => void;
  onRemoveSource: () => void;
  onToggleLibrary: () => void;
  onRetryLibrary: () => void;
  onSelectLibrary: (asset: VideoLibraryAsset) => void;
  onPromptChange: (prompt: string) => void;
  onQualityChange: (quality: VideoQuality) => void;
  onAspectRatioChange: (aspectRatio: VideoAspectRatio) => void;
  onDurationChange: (duration: VideoDuration) => void;
  onGenerate: () => void;
};

export function VideoGenerationInspector({
  approvalControls,
  costSummary,
  referenceControls,
  presetControls,
  directorControls,
  advancedSettings,
  preservationControls,
  copy,
  source,
  prompt,
  quality,
  qualityOptions,
  aspectRatio,
  aspectRatioOptions,
  duration,
  durationOptions,
  feedbackMessage,
  feedbackIsError,
  isReady,
  isSubmitting,
  showLibraryLink,
  generationAvailable,
  libraryAssets,
  libraryOpen,
  libraryStatus,
  incomingSourceStatus,
  onFile,
  onRemoveSource,
  onToggleLibrary,
  onRetryLibrary,
  onSelectLibrary,
  onPromptChange,
  onQualityChange,
  onAspectRatioChange,
  onDurationChange,
  onGenerate,
}: VideoGenerationInspectorProps) {
  return (
    <aside className={styles.inspector} aria-label={copy.title}>
      <div className={styles.inspectorScroll}>
        <VideoSourceSelector
          source={source}
          libraryAssets={libraryAssets}
          libraryOpen={libraryOpen}
          libraryStatus={libraryStatus}
          incomingStatus={incomingSourceStatus}
          copy={copy.source}
          onFile={onFile}
          onRemove={onRemoveSource}
          onToggleLibrary={onToggleLibrary}
          onRetryLibrary={onRetryLibrary}
          onSelectLibrary={onSelectLibrary}
        />

        {referenceControls}
        {presetControls}

        <section className={styles.controlSection} aria-labelledby="video-prompt-heading">
          <div className={styles.controlHeading}>
            <h2 id="video-prompt-heading"><span className={styles.stepNumber} aria-hidden="true">03</span>{copy.promptHeading}</h2>
          </div>
          <textarea
            className={styles.promptEditor}
            value={prompt}
            aria-labelledby="video-prompt-heading"
            aria-describedby="video-prompt-description"
            placeholder={copy.promptPlaceholder}
            rows={3}
            onChange={(event) => onPromptChange(event.target.value)}
          />
          <p id="video-prompt-description" className={styles.fieldDescription}>{copy.promptDescription}</p>
        </section>

        <fieldset className={styles.controlSection}>
          <legend><span className={styles.stepNumber} aria-hidden="true">04</span>{copy.qualityHeading}</legend>
          <div className={styles.qualityOptions}>
            {qualityOptions.length === 1 ? <div className={styles.activeOption}>
              <strong>{qualityOptions[0]?.label}</strong>
              <small>{qualityOptions[0]?.description}</small>
            </div> : qualityOptions.map((option) => (
              <label key={option.value} aria-disabled={option.disabled || undefined} title={option.disabled ? option.description : undefined}>
                <input
                  type="radio"
                  name="video-quality"
                  value={option.value}
                  checked={quality === option.value}
                  disabled={option.disabled}
                  onChange={() => onQualityChange(option.value)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.controlSection}>
          <legend>{copy.outputHeading}</legend>
          <div className={styles.outputColumns}>
          <div className={styles.outputGroup} role="group" aria-label={copy.aspectRatioLabel}>
            <span>{copy.aspectRatioLabel}</span>
            <div className={styles.outputOptions}>
              {aspectRatioOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="video-aspect-ratio"
                    value={option.value}
                    checked={aspectRatio === option.value}
                    onChange={() => onAspectRatioChange(option.value)}
                  />
                  <span><i className={styles.ratioIcon} data-ratio={option.value} aria-hidden="true" />{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className={styles.outputGroup} role="group" aria-label={copy.durationLabel}>
            <span>{copy.durationLabel}</span>
            <div className={styles.outputOptions}>
              {durationOptions.map((option) => (
                <label key={option.value} aria-disabled={option.disabled || undefined} title={option.disabled ? option.description : undefined}>
                  <input
                    type="radio"
                    name="video-duration"
                    value={option.value}
                    checked={duration === option.value}
                    disabled={option.disabled}
                    onChange={() => onDurationChange(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {durationOptions.some(option => option.disabled) ? <p className={styles.fieldDescription}>{durationOptions.find(option => option.disabled)?.description}</p> : null}
          </div>
          </div>
        </fieldset>
        {advancedSettings ?? preservationControls}
        {directorControls}
      </div>

      <footer className={styles.inspectorFooter}>
        <h2><span className={styles.stepNumber} aria-hidden="true">06</span>{copy.approvalHeading}</h2>
        {costSummary}
        {approvalControls}
        <Button
          className={styles.generateButton}
          variant={isReady ? "primary" : "secondary"}
          aria-busy={isSubmitting}
          aria-describedby="video-studio-feedback"
          onClick={onGenerate}
          disabled={!generationAvailable}
        >
          {copy.generate}
        </Button>
        <p
          id="video-studio-feedback"
          className={styles.feedback}
          data-error={feedbackIsError || undefined}
          role={feedbackMessage ? (feedbackIsError ? "alert" : "status") : undefined}
          aria-live="polite"
        >
          {feedbackMessage}
        </p>
        {showLibraryLink ? <Link className={styles.usedSubmissionLink} href="/dashboard/videos">{copy.libraryLink}</Link> : null}
      </footer>
    </aside>
  );
}
