"use client";

import { useTheme, type ThemePreference } from "@/components/theme/theme-provider";
import styles from "./theme-preference-control.module.css";

export type ThemePreferenceControlProps = { labels: { group: string; system: string; dark: string; light: string }; compact?: boolean };
const options: { value: ThemePreference; icon: "monitor" | "moon" | "sun" }[] = [
  { value: "light", icon: "sun" }, { value: "dark", icon: "moon" }, { value: "system", icon: "monitor" },
];

function ThemeIcon({ name }: { name: "monitor" | "moon" | "sun" }) {
  if (name === "monitor") return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></svg>;
  if (name === "moon") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>;
}

export function ThemePreferenceControl({ labels, compact = false }: ThemePreferenceControlProps) {
  const { preference, setPreference } = useTheme();
  return <div className={`appearance-options${compact ? ` ${styles.compact}` : ""}`} role="radiogroup" aria-label={labels.group}>
    {options.map(({ value, icon }, index) => <button key={value} type="button" role="radio" aria-checked={preference === value} tabIndex={preference === value ? 0 : -1} className="appearance-option" onClick={() => setPreference(value)} onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : options.length - 1)) % options.length;
      const next = options[nextIndex];
      setPreference(next.value);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]")[nextIndex]?.focus();
    }}>
      {!compact ? <span className={`appearance-preview appearance-preview-${value}`} aria-hidden="true">
        <span className="appearance-preview-sidebar" />
        <span className="appearance-preview-content"><i /><i /><i /></span>
      </span> : null}
      <span className="appearance-option-label"><ThemeIcon name={icon} /><span>{labels[value]}</span></span>
      {!compact && preference === value ? <span className="appearance-check" aria-hidden="true">✓</span> : null}
    </button>)}
  </div>;
}
