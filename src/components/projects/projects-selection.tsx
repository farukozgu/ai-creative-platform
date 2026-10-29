"use client";

import {createContext, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode} from "react";
import {useTranslations} from "next-intl";
import {deleteProjects} from "@/app/[locale]/dashboard/actions";
import {Button} from "@/components/ui/button";
import {useRouter} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {toggleProjectSelection} from "@/lib/projects/project-selection";
import styles from "./projects-selection.module.css";

type SelectionContextValue = {
  selected: string[];
  busy: boolean;
  setSinglePending: (value: boolean) => void;
  toggle: (id: string) => void;
};
const SelectionContext = createContext<SelectionContextValue | null>(null);
export function useProjectSelection() { return useContext(SelectionContext); }

export function ProjectSelectionCheckbox({id, title}: {id: string; title: string}) {
  const selection = useProjectSelection();
  const t = useTranslations("Dashboard.projectManagement");
  if (!selection) return null;
  return <label className={styles.cardSelection} onClick={event => event.stopPropagation()}>
    <input type="checkbox" aria-label={t("selectProject", {title})} checked={selection.selected.includes(id)} disabled={selection.busy} onChange={() => selection.toggle(id)} />
  </label>;
}

export function ProjectsSelection({pageIds, locale, children, toolbar}: {pageIds: string[]; locale: AppLocale; children: ReactNode; toolbar?: ReactNode}) {
  const t = useTranslations("Dashboard.projectManagement");
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds.filter(id => pageIds.includes(id));
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [singlePending, setSinglePending] = useState(false);
  const busy = pending || singlePending;
  const submissionRef = useRef(false);
  const [outcome, setOutcome] = useState<{deleted: number; failed: number} | null>(null);
  const [error, setError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const allSelected = pageIds.length > 0 && selected.length === pageIds.length;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
    }
    if (!open && dialog?.open) {
      dialog.close();
      (deleteTriggerRef.current ?? allRef.current)?.focus();
    }
  }, [open]);

  function close() {
    if (submissionRef.current) return;
    setOpen(false);
    deleteTriggerRef.current?.focus();
  }

  function confirm() {
    if (submissionRef.current || busy || selected.length === 0) return;
    submissionRef.current = true;
    const ids = [...selected];
    setError(false);
    startTransition(async () => {
      try {
        const result = await deleteProjects(locale, ids);
        setOutcome({deleted: result.deletedIds.length, failed: result.failedIds.length});
        if (result.status === "error") { setError(true); return; }
        setSelectedIds(result.failedIds);
        setOpen(false);
        router.refresh();
        allRef.current?.focus();
      } catch { setError(true); }
      finally { submissionRef.current = false; }
    });
  }

  return <SelectionContext.Provider value={{selected, busy, setSinglePending, toggle: id => {
    if (!busy) setSelectedIds(current => toggleProjectSelection(current, id, pageIds));
  }}}>
    {toolbar || pageIds.length > 0 ? <div className={styles.toolbar} aria-label={t("selectionToolbar")}>
      <div className={styles.filters}>
        {toolbar}
        <label className={styles.selectAll}><input ref={allRef} type="checkbox" checked={allSelected} disabled={busy || pageIds.length === 0} onChange={() => setSelectedIds(allSelected ? [] : [...pageIds])} />{t("selectAll")}</label>
      </div>
      {selected.length > 0 ? <div className={styles.actions}>
        <span role="status">{t("selectedCount", {count: selected.length})}</span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelectedIds([])}>{t("clear")}</Button>
        <Button ref={deleteTriggerRef} variant="secondary" size="sm" disabled={busy} onClick={() => { setError(false); setOpen(true); }}>{t("deleteSelected")}</Button>
      </div> : null}
    </div> : null}
    {outcome ? <p className={styles.feedback} role="status">{t("result", outcome)}</p> : null}
    {children}
    <dialog ref={dialogRef} className={`delete-project-dialog ${styles.dialog}`} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="delete-project-dialog-content">
        <h2 id={titleId}>{t("confirmTitle", {count: selected.length})}</h2>
        <p id={descriptionId}>{t("confirmDescription", {count: selected.length})}</p>
        {error ? <p role="alert">{t("deleteError")}</p> : null}
        <div className="delete-project-dialog-actions">
          <Button variant="secondary" size="sm" disabled={pending} onClick={close}>{t("cancel")}</Button>
          <form onSubmit={event => { event.preventDefault(); confirm(); }}><Button type="submit" variant="destructive" size="sm" disabled={pending || selected.length === 0} aria-busy={pending}>{pending ? t("deleting") : t("confirmDelete", {count: selected.length})}</Button></form>
        </div>
      </div>
    </dialog>
  </SelectionContext.Provider>;
}
