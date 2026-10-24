import {StatusBadge} from "@/components/dashboard/status-badge";
import {DashboardIcon} from "@/components/dashboard/dashboard-icons";
import {ProjectDeleteButton} from "@/components/projects/project-delete-button";
import {ProjectSelectionCheckbox} from "@/components/projects/projects-selection";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import type {Project} from "@/lib/projects/get-projects";

type ProjectGalleryCardProps = {
  project: Project;
  locale: AppLocale;
  messages: {
    untitled: string;
    previewAlt: string;
    noPreview: string;
    open: string;
    updatedLabel: string;
    projectActions: string;
    delete: string;
    deleteProject: string;
    deleteHeading: string;
    deleteDescription: string;
    cancel: string;
    deleting: string;
    deleteError: string;
  };
  verticals: Record<string, string>;
};

export function ProjectGalleryCard({project, locale, messages, verticals}: ProjectGalleryCardProps) {
  const title = project.title?.trim() || messages.untitled;
  const href = `/dashboard/projects/${project.id}` as const;
  const date = new Intl.DateTimeFormat(locale, {day: "numeric", month: "short", year: "numeric"}).format(new Date(project.updated_at));
  return (
    <li className="projects-gallery-item">
      <div className="projects-gallery-controls">
        <ProjectSelectionCheckbox id={project.id} title={title} />
        <span className="projects-gallery-category">{project.vertical ? verticals[project.vertical] : <DashboardIcon name="projects" />}</span>
        <ProjectDeleteButton projectId={project.id} title={title} locale={locale} messages={{title: messages.deleteHeading, description: messages.deleteDescription, cancel: messages.cancel, confirm: messages.deleteProject, deleting: messages.deleting, error: messages.deleteError}} />
      </div>
      <Link href={href} className="projects-gallery-card" aria-label={`${messages.open}: ${title}`}>
        <span className="projects-gallery-media" data-thumbnail-source={project.thumbnail_source ?? "none"}>
          {project.thumbnail_url ? (
            // Private Storage previews use the existing signed URL pattern.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.thumbnail_url} alt={messages.previewAlt.replace("{title}", title)} loading="lazy" decoding="async" />
          ) : <span className="projects-gallery-placeholder"><DashboardIcon name="projects" /><span>{messages.noPreview}</span></span>}
        </span>
        <span className="projects-gallery-copy">
            <span className="projects-gallery-title" title={title}>{title}</span>
            <span className="projects-gallery-meta">
              <time dateTime={project.updated_at}>{messages.updatedLabel} {date}</time>
            </span>
            <span className="projects-gallery-status"><StatusBadge status={project.latest_generation?.status ?? project.status} kind={project.latest_generation ? "generation" : "project"} /></span>
        </span>
      </Link>
    </li>
  );
}
