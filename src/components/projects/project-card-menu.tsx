"use client";

import {useState} from "react";
import {deleteProject} from "@/app/[locale]/dashboard/actions";
import {DeleteProjectModal} from "@/components/projects/delete-project-modal";
import {Button} from "@/components/ui/button";
import {useDismissiblePopover} from "@/hooks/use-dismissible-popover";
import type {AppLocale} from "@/i18n/routing";

type ProjectCardMenuProps = {
  projectId: string;
  locale: AppLocale;
  menuLabel: string;
  deleteMessages: {title: string; description: string; menuItem: string; cancel: string; confirm: string; deleting: string; error: string};
  redirectOnSuccess?: boolean;
};

export function ProjectCardMenu({projectId, locale, menuLabel, deleteMessages, redirectOnSuccess = false}: ProjectCardMenuProps) {
  const {close, isOpen: menuOpen, rootRef, toggle, triggerRef} = useDismissiblePopover();
  const [modalOpen, setModalOpen] = useState(false);
  const action = deleteProject.bind(null, locale, projectId);

  return <div ref={rootRef} className="project-card-actions" onClick={(event) => event.stopPropagation()}>
    <Button ref={triggerRef} type="button" variant="icon" size="sm" className="project-card-menu-trigger" aria-label={menuLabel} aria-haspopup="menu" aria-expanded={menuOpen} onClick={toggle}>
      <span aria-hidden="true">···</span>
    </Button>
    {menuOpen ? <div className="project-card-menu-content" role="menu">
      <button type="button" role="menuitem" onClick={() => { close(); setModalOpen(true); }}>{deleteMessages.menuItem}</button>
    </div> : null}
    <DeleteProjectModal action={action} open={modalOpen} onClose={() => setModalOpen(false)} redirectOnSuccess={redirectOnSuccess} messages={deleteMessages} />
  </div>;
}
