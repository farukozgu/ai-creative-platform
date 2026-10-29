"use client";

import {useActionState, useEffect, useId, useRef} from "react";
import {useRouter} from "@/i18n/navigation";
import type {DeleteProjectState} from "@/app/[locale]/dashboard/actions";
import {Button} from "@/components/ui/button";

const initialState: DeleteProjectState = {status: "idle"};

type DeleteProjectModalProps = {
  action: (previousState: DeleteProjectState, formData: FormData) => Promise<DeleteProjectState>;
  open: boolean;
  onClose: () => void;
  redirectOnSuccess?: boolean;
  onPendingChange?: (pending: boolean) => void;
  messages: {title: string; description: string; cancel: string; confirm: string; deleting: string; error: string};
};

export function DeleteProjectModal({action, open, onClose, redirectOnSuccess = false, onPendingChange, messages}: DeleteProjectModalProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open && !pending) dialogRef.current?.querySelector<HTMLButtonElement>(".delete-project-dialog-actions button")?.focus();
  }, [open, pending]);

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    onClose();
    if (redirectOnSuccess) {
      router.replace("/dashboard/projects");
      return;
    }
    router.refresh();
  }, [state.status, redirectOnSuccess, router, onClose]);

  function close() {
    if (pending) return;
    dialogRef.current?.close();
    onClose();
  }

  return <dialog
    ref={dialogRef}
    className="delete-project-dialog"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}
  >
    <div className="delete-project-dialog-content">
      <h2 id={titleId}>{messages.title}</h2>
      <p id={descriptionId}>{messages.description}</p>
      {state.status === "error" ? <p role="alert">{messages.error}</p> : null}
      <div className="delete-project-dialog-actions">
        <Button type="button" variant="secondary" size="sm" onClick={close} disabled={pending}>{messages.cancel}</Button>
        <form action={formAction}>
          <Button type="submit" variant="destructive" size="sm" disabled={pending} aria-busy={pending}>{pending ? messages.deleting : messages.confirm}</Button>
        </form>
      </div>
    </div>
  </dialog>;
}
