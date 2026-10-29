"use client";

import { Button } from "@/components/ui/button";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { markAllNotificationsRead, markNotificationRead } from "@/app/[locale]/dashboard/notification-actions";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";
import { countUnreadNotifications, getNotificationHref, markAllNotificationsReadInList, markNotificationReadInList, maxVisibleNotifications, type NotificationItem, type NotificationType } from "@/lib/notifications/types";

type NotificationCenterProps = {
  initialItems: NotificationItem[];
  loadFailed?: boolean;
  renderedAt: number;
};

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function iconFor(type: NotificationType) {
  if (type === "generation_failed" || type === "image_edit_failed") return "alert" as const;
  if (type === "image_edit_completed") return "edit" as const;
  return "image" as const;
}

export function NotificationCenter({ initialItems, loadFailed = false, renderedAt }: NotificationCenterProps) {
  const t = useTranslations("Dashboard.notifications");
  const locale = useLocale();
  const router = useRouter();
  const { close, isOpen, rootRef, toggle, triggerRef } = useDismissiblePopover();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [items, setItems] = useState(() => initialItems.slice(0, maxVisibleNotifications));
  const [isPending, startTransition] = useTransition();
  const unreadCount = countUnreadNotifications(items);
  const groups = useMemo(() => ({
    today: items.filter((item) => isToday(item.createdAt)),
    earlier: items.filter((item) => !isToday(item.createdAt)),
  }), [items]);

  useEffect(() => {
    if (isOpen) headingRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  function relativeTime(value: string) {
    const elapsed = new Date(value).getTime() - renderedAt;
    const absolute = Math.abs(elapsed);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    if (absolute < 60 * 60 * 1000) return formatter.format(Math.round(elapsed / (60 * 1000)), "minute");
    if (absolute < 24 * 60 * 60 * 1000) return formatter.format(Math.round(elapsed / (60 * 60 * 1000)), "hour");
    return formatter.format(Math.round(elapsed / (24 * 60 * 60 * 1000)), "day");
  }

  function copy(item: NotificationItem, field: "title" | "message") {
    const projectName = item.projectName || t("fallbackProject");
    return t(`${item.type}.${field}`, { projectName });
  }

  function openNotification(item: NotificationItem) {
    setItems((current) => markNotificationReadInList(current, item.id));
    close();
    startTransition(async () => {
      await markNotificationRead(item.id);
      router.push(getNotificationHref(locale, item));
    });
  }

  function markAllRead() {
    const previous = items;
    setItems((current) => markAllNotificationsReadInList(current));
    startTransition(async () => {
      if (!(await markAllNotificationsRead())) setItems(previous);
      else router.refresh();
    });
  }

  function renderGroup(label: string, groupItems: NotificationItem[]) {
    if (!groupItems.length) return null;
    return <section className="notification-group" aria-label={label}>
      <h3>{label}</h3>
      <div className="notification-list">
        {groupItems.map((item) => <button
          key={item.id}
          type="button"
          className={`notification-item${item.isRead ? "" : " is-unread"}`}
          aria-label={`${copy(item, "title")}. ${copy(item, "message")}. ${relativeTime(item.createdAt)}${item.isRead ? "" : `. ${t("unread")}`}`}
          onClick={() => openNotification(item)}
          disabled={isPending}
        >
          <span className={`notification-item-icon notification-item-icon-${item.type.includes("failed") ? "failed" : "success"}`} aria-hidden="true"><DashboardIcon name={iconFor(item.type)} /></span>
          <span className="notification-item-copy">
            <span className="notification-item-title-row"><strong>{copy(item, "title")}</strong>{!item.isRead ? <span className="notification-unread-dot" /> : null}</span>
            <span>{copy(item, "message")}</span>
            <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
          </span>
        </button>)}
      </div>
    </section>;
  }

  const badge = unreadCount > 9 ? "9+" : String(unreadCount);
  return <div ref={rootRef} className="notification-center">
    <Button variant="icon" size="md" ref={triggerRef} type="button" className="notification-trigger" aria-label={unreadCount ? t("triggerUnread", { count: unreadCount }) : t("trigger")} aria-haspopup="dialog" aria-expanded={isOpen} onClick={toggle}>
      <DashboardIcon name="bell" />
      {unreadCount ? <span className="notification-badge" aria-hidden="true">{badge}</span> : null}
    </Button>
    {isOpen ? <div className="notification-panel" role="dialog" aria-modal="false" aria-labelledby="notification-panel-title">
      <div className="notification-panel-header">
        <h2 id="notification-panel-title" ref={headingRef} tabIndex={-1}>{t("title")}</h2>
        {unreadCount ? <Button variant="ghost" size="sm" type="button" onClick={markAllRead} disabled={isPending}>{t("markAllRead")}</Button> : null}
      </div>
      <div className="notification-panel-body">
        {loadFailed ? <div className="notification-state" role="alert"><strong>{t("loadError")}</strong><Button variant="icon" size="sm" type="button" onClick={() => router.refresh()}>{t("retry")}</Button></div> : null}
        {!loadFailed && !items.length ? <div className="notification-state"><strong>{t("emptyTitle")}</strong><span>{t("emptyDescription")}</span></div> : null}
        {!loadFailed ? <>{renderGroup(t("today"), groups.today)}{renderGroup(t("earlier"), groups.earlier)}</> : null}
      </div>
    </div> : null}
  </div>;
}
