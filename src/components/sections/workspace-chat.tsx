"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

import { type WorkspaceGenerationState } from "@/data/workspace-demo";
import { cn } from "@/lib/cn";

type WorkspaceChatProps = {
  prompt: string;
  agentResponse: string;
  draft: string;
  generationState: WorkspaceGenerationState;
  onDraftChange: (value: string) => void;
  onNewChat: () => void;
  onSubmit: (prompt: string) => void;
};

const generationStateIndex: Record<WorkspaceGenerationState, number> = {
  idle: 3,
  analyzing: 0,
  researching: 1,
  composing: 2,
  complete: 3,
};

export function WorkspaceChat({
  prompt,
  agentResponse,
  draft,
  generationState,
  onDraftChange,
  onNewChat,
  onSubmit,
}: WorkspaceChatProps) {
  const t = useTranslations("WorkspaceDemo");
  const statusSteps = [
    t("status.analyzed"),
    t("status.explored"),
    t("status.collected"),
  ];
  const activeStatusIndex = generationStateIndex[generationState];
  const isGenerating =
    generationState !== "idle" && generationState !== "complete";

  function submitPrompt() {
    const trimmedPrompt = draft.trim();

    if (trimmedPrompt) {
      onSubmit(trimmedPrompt);
    }
  }

  return (
    <aside
      aria-label={t("chatLabel")}
      className="workspace-chat-panel flex min-h-[32rem] min-w-0 flex-col border-t border-[var(--workspace-line)] bg-[var(--workspace-panel)] text-[var(--workspace-text)] xl:min-h-0 xl:border-l xl:border-t-0"
    >
      <div className="flex min-h-14 items-center justify-between border-b border-[var(--workspace-line)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--workspace-control)] text-[var(--workspace-muted)]"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
              <path
                d="M8 2.25 9.3 6.7 13.75 8 9.3 9.3 8 13.75 6.7 9.3 2.25 8 6.7 6.7 8 2.25Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <p className="truncate text-xs font-medium">{t("agentName")}</p>
        </div>
        <Button variant="ghost" size="sm"
          type="button"
          className="workspace-chat-action"
          onClick={onNewChat}
        >
          {t("newChat")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
        <div className="ml-auto max-w-[92%] rounded-[var(--radius-md)] rounded-br-[var(--radius-sm)] bg-[var(--workspace-control)] px-3.5 py-3">
          <p className="text-xs leading-5 text-[var(--workspace-text)]">
            {prompt}
          </p>
        </div>

        <div className="space-y-2.5">
          {statusSteps.map((step, index) => {
            const isActive = isGenerating && index === activeStatusIndex;
            const isComplete =
              generationState === "complete" ||
              generationState === "idle" ||
              index < activeStatusIndex;

            return (
              <div
                key={step}
                className={cn(
                  "flex min-h-6 items-center gap-2 text-[0.6875rem] leading-4 transition-colors duration-(--transition-fast) motion-reduce:transition-none",
                  isActive || isComplete
                    ? "text-[var(--workspace-text)]"
                    : "text-[var(--workspace-muted)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                    isComplete &&
                      "border-[var(--workspace-line-strong)] bg-[var(--workspace-control)] text-[var(--workspace-text)]",
                    isActive &&
                      "workspace-status-active border-[var(--workspace-muted)]",
                    !isComplete &&
                      !isActive &&
                      "border-[var(--workspace-line-strong)]",
                  )}
                >
                  {isComplete ? (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                      <path
                        d="m2.5 6 2.1 2.1L9.5 3.4"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.6"
                      />
                    </svg>
                  ) : isActive ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--workspace-text)]" />
                  ) : null}
                </span>
                <span>{step}</span>
              </div>
            );
          })}
        </div>

        <div
          key={`${agentResponse}-${isGenerating ? "loading" : "ready"}`}
          className={cn(
            "workspace-chat-response flex gap-2.5 motion-reduce:animation-none",
          )}
        >
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--workspace-control)] text-[var(--workspace-text)]"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
              <path
                d="M6 1.75 7 5l3.25 1L7 7l-1 3.25L5 7 1.75 6 5 5l1-3.25Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-medium text-[var(--workspace-muted)]">
              {t("agentName")}
            </p>
            {isGenerating ? (
              <span aria-hidden="true" className="mt-2 block space-y-1.5">
                <span className="workspace-chat-loading-line block w-full" />
                <span className="workspace-chat-loading-line block w-4/5" />
                <span className="workspace-chat-loading-line block w-3/5" />
              </span>
            ) : (
              <p className="mt-1.5 text-xs leading-5 text-[var(--workspace-text)]">
                {agentResponse}
              </p>
            )}
          </div>
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {t(`liveStatus.${generationState}`)}
        </p>
      </div>

      <form
        className="border-t border-[var(--workspace-line)] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitPrompt();
        }}
      >
        <label className="sr-only" htmlFor="workspace-prompt">
          {t("composerLabel")}
        </label>
        <div className="rounded-[var(--radius-md)] border border-[var(--workspace-line-strong)] bg-[var(--workspace-canvas)] p-2.5 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]">
          <textarea
            id="workspace-prompt"
            rows={2}
            value={draft}
            className="min-h-12 w-full resize-none bg-transparent px-1 text-xs leading-5 text-[var(--workspace-text)] outline-none placeholder:text-[var(--workspace-muted)]"
            placeholder={t("composerPlaceholder")}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <div
              aria-hidden="true"
              className="flex items-center gap-1.5 text-[var(--workspace-muted)]"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--workspace-control)]">
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                  <path
                    d="m5.4 8.4 3.7-3.7a2.15 2.15 0 0 1 3 3l-5 5a3.1 3.1 0 0 1-4.4-4.4l5-5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.3"
                  />
                </svg>
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--workspace-control)]">
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                  <rect
                    x="2.5"
                    y="3"
                    width="11"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="m4.5 10 2.2-2.2 1.7 1.7 1.3-1.3 1.8 1.8"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.2"
                  />
                </svg>
              </span>
            </div>
            <Button variant="icon" shape="round" size="sm"
              type="submit"
              aria-label={t("send")}
              disabled={!draft.trim()}
              className="workspace-chat-action"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                <path
                  d="M3 8h9.5M9 4.5 12.5 8 9 11.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
            </Button>
          </div>
        </div>
      </form>
    </aside>
  );
}
