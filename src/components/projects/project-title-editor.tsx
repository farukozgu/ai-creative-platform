"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { renameProject, type RenameProjectState } from "@/app/[locale]/dashboard/projects/[projectId]/actions";
import { Button } from "@/components/ui/button";

const initialState: RenameProjectState = { status: "idle" };

type ProjectTitleEditorProps = {
  projectId: string;
  locale: "tr" | "en";
  title: string | null;
  fallback: string;
  messages: {
    edit: string;
    description: string;
    label: string;
    placeholder: string;
    save: string;
    cancel: string;
    saving: string;
    error: string;
  };
};

export function ProjectTitleEditor({ projectId, locale, title, fallback, messages }: ProjectTitleEditorProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const labelId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, action, pending] = useActionState(async (previousState: RenameProjectState, formData: FormData) => {
    const result = await renameProject(locale, projectId, previousState, formData);
    if (result.status === "success") {
      setOpen(false);
      dialogRef.current?.close();
    }
    return result;
  }, initialState);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  function close() {
    if (pending) return;
    setOpen(false);
    dialogRef.current?.close();
  }

  return <>
    <div className="project-title-edit-row">
      <h1 id="project-heading">{title?.trim() || fallback}</h1>
      <Button variant="icon" size="sm" ref={triggerRef} type="button" className="project-title-edit-button" aria-label={messages.edit} onClick={() => setOpen(true)}>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m12.9 3.9 3.2 3.2M4 16l3.4-.7L16 6.7a1.5 1.5 0 0 0-2.1-2.1l-8.6 8.6L4 16Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Button>
    </div>
    <dialog
      ref={dialogRef}
      className="delete-project-dialog rename-project-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => { if (pending) event.preventDefault(); else setOpen(false); }}
      onClose={() => { if (!pending) triggerRef.current?.focus(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <form className="rename-project-dialog-content" action={action} onSubmit={() => {
        const input = inputRef.current;
        if (input) input.value = input.value.trim() || fallback;
      }} onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          close();
        }
      }}>
        <h2 id={titleId}>{messages.edit}</h2>
        <p>{messages.description}</p>
        <label id={labelId} htmlFor="rename-project-title">{messages.label}</label>
        <input ref={inputRef} id="rename-project-title" name="title" defaultValue={title ?? ""} placeholder={messages.placeholder} maxLength={120} aria-labelledby={labelId} disabled={pending} />
        {state.status === "error" || state.status === "validation" ? <p className="rename-project-error" role="alert">{messages.error}</p> : null}
        <div className="delete-project-dialog-actions">
          <Button type="button" variant="secondary" size="sm" onClick={close} disabled={pending}>{messages.cancel}</Button>
          <Button type="submit" variant="primary" size="sm" disabled={pending} aria-busy={pending}>{pending ? messages.saving : messages.save}</Button>
        </div>
      </form>
    </dialog>
  </>;
}
