"use client";

import { useEffect, useId, useRef } from "react";

import {
  type WorkspaceScenarioId,
  workspaceScenarios,
} from "@/data/workspace-demo";
import { cn } from "@/lib/cn";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";

type WorkspaceProjectSelectorProps = {
  activeScenarioId: WorkspaceScenarioId;
  menuLabel: string;
  projectNames: Record<WorkspaceScenarioId, string>;
  selectProjectLabel: string;
  onOpenChange?: (isOpen: boolean) => void;
  onScenarioChange: (scenarioId: WorkspaceScenarioId) => void;
};

export function WorkspaceProjectSelector({
  activeScenarioId,
  menuLabel,
  projectNames,
  selectProjectLabel,
  onOpenChange,
  onScenarioChange,
}: WorkspaceProjectSelectorProps) {
  const menuId = useId();
  const { close, isOpen, open, rootRef, toggle, triggerRef } = useDismissiblePopover();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const activeIndex = workspaceScenarios.findIndex(
      (scenario) => scenario.id === activeScenarioId,
    );
    optionRefs.current[Math.max(activeIndex, 0)]?.focus();

  }, [activeScenarioId, isOpen]);

  function focusOption(index: number) {
    const optionCount = workspaceScenarios.length;
    optionRefs.current[(index + optionCount) % optionCount]?.focus();
  }

  function handleOptionKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(workspaceScenarios.length - 1);
    } else if (event.key === "Tab") {
      close();
    }
  }

  function selectScenario(scenarioId: WorkspaceScenarioId) {
    onScenarioChange(scenarioId);
    close();
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative z-40 min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={selectProjectLabel}
        className="group flex min-h-10 max-w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-left text-xs font-medium text-[var(--workspace-text)] transition-colors duration-(--transition-fast) hover:bg-[var(--workspace-control)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] sm:text-sm"
        onClick={toggle}
        onKeyDown={(event) => {
          if (
            !isOpen &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();
            open();
          }
        }}
      >
        <span className="truncate">{projectNames[activeScenarioId]}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 8"
          className={cn(
            "h-2 w-3 shrink-0 transition-transform duration-(--transition-fast) motion-reduce:transition-none",
            isOpen && "rotate-180",
          )}
          fill="none"
        >
          <path
            d="m1 1.25 5 5 5-5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          className="workspace-project-menu absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-3rem))] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--workspace-line)] bg-[var(--workspace-panel-raised)] p-1.5 shadow-[var(--shadow-subtle)]"
        >
          {workspaceScenarios.map((scenario, index) => {
            const isActive = scenario.id === activeScenarioId;

            return (
              <button
                key={scenario.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-2 text-left text-xs text-[var(--workspace-muted)] transition-colors duration-(--transition-fast) hover:bg-[var(--workspace-control)] hover:text-[var(--workspace-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:text-sm",
                  isActive &&
                    "bg-[var(--workspace-control)] text-[var(--workspace-text)]",
                )}
                onClick={() => selectScenario(scenario.id)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span>{projectNames[scenario.id]}</span>
                {isActive ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-4 w-4 shrink-0 text-[var(--accent)]"
                    fill="none"
                  >
                    <path
                      d="m3 8.2 3.1 3.1L13 4.7"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.75"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
