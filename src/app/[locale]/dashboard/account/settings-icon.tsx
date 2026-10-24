import type { SettingsSection, UpcomingSetting } from "./settings-sections";

export function SettingsIcon({ name }: { name: SettingsSection | UpcomingSetting }) {
  const paths = {
    profile: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
    security: <><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><path d="m9.5 12 1.6 1.6 3.5-3.7" /></>,
    sessions: <><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M8 21h8m-4-4v4" /></>,
    appearance: <><path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-1.1a2 2 0 0 1-1.7-3l.5-.9A2 2 0 0 0 15 3.2 9 9 0 0 0 12 3Z" /><circle cx="7.5" cy="11" r=".7" /><circle cx="10" cy="7" r=".7" /></>,
    notifications: <><path d="M18 9a6 6 0 0 0-12 0v4l-2 4v1h16v-1l-2-4V9ZM10 21h4" /></>,
    usage: <><path d="M5 20V10m7 10V4m7 16v-7" /></>,
    brands: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 16 4-8 4 8m-6.5-3h5" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1m2-15a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5" /></>,
    integrations: <><path d="m8 16-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1M8 16l8-8" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
