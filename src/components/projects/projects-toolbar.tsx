"use client";

import {useEffect, useRef} from "react";

type ProjectsToolbarProps = {
  action: string;
  search: string;
  status: string;
  sort: string;
  messages: {
    search: string;
    searchPlaceholder: string;
    status: string;
    allStatuses: string;
    draft: string;
    active: string;
    completed: string;
    failed: string;
    sort: string;
    updated: string;
    newest: string;
    oldest: string;
  };
};

export function ProjectsToolbar({action, search, status, sort, messages}: ProjectsToolbarProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function submitSearch() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => formRef.current?.requestSubmit(), 350);
  }

  return (
    <form ref={formRef} action={action} method="get" role="search" className="projects-toolbar">
      <label className="projects-toolbar-search">
        <span className="sr-only">{messages.search}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
        <input type="search" name="q" defaultValue={search} placeholder={messages.searchPlaceholder} onChange={submitSearch} maxLength={100} />
      </label>
      <label className="projects-toolbar-select"><span>{messages.status}</span><select name="status" defaultValue={status} onChange={() => formRef.current?.requestSubmit()}><option value="">{messages.allStatuses}</option><option value="draft">{messages.draft}</option><option value="active">{messages.active}</option><option value="completed">{messages.completed}</option><option value="failed">{messages.failed}</option></select></label>
      <label className="projects-toolbar-select"><span>{messages.sort}</span><select name="sort" defaultValue={sort} onChange={() => formRef.current?.requestSubmit()}><option value="updated">{messages.updated}</option><option value="newest">{messages.newest}</option><option value="oldest">{messages.oldest}</option></select></label>
      <button type="submit" className="sr-only">{messages.search}</button>
    </form>
  );
}
