"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { SettingsIcon } from "./settings-icon";
import { resolveSettingsSection, settingsHref, settingsSections, upcomingSettings, type SettingsSection, type UpcomingSetting } from "./settings-sections";
import styles from "./settings.module.css";

export type SettingsNavigationLabels = {
  navigation: string;
  current: string;
  upcoming: string;
  comingSoon: string;
  selector: string;
  sections: Record<SettingsSection, string>;
  future: Record<UpcomingSetting, string>;
};

export function SettingsNavigation({ selected, labels }: { selected: SettingsSection; labels: SettingsNavigationLabels }) {
  const router = useRouter();
  const futureItems = upcomingSettings.map((section) => <button key={section} type="button" className={styles.upcomingItem} disabled>
    <SettingsIcon name={section} /><span>{labels.future[section]}</span><small>{labels.comingSoon}</small>
  </button>);

  return <>
    <nav className={styles.navigation} aria-label={labels.navigation}>
      <p className={styles.groupLabel}>{labels.current}</p>
      {settingsSections.map((section) => <Link key={section} href={settingsHref(section)} scroll={false} aria-current={selected === section ? "page" : undefined} className={styles.navItem}>
        <SettingsIcon name={section} /><span>{labels.sections[section]}</span>
      </Link>)}
      <div className={styles.upcoming}><p className={styles.groupLabel}>{labels.upcoming}</p>{futureItems}</div>
    </nav>
    <div className={styles.mobileNavigation}>
      <label className={styles.sectionSelector}><span>{labels.selector}</span><select value={selected} onChange={(event) => router.push(settingsHref(resolveSettingsSection(event.target.value)), { scroll: false })}>
        {settingsSections.map((section) => <option key={section} value={section}>{labels.sections[section]}</option>)}
      </select></label>
      <details className={styles.mobileUpcoming}><summary>{labels.upcoming} <span>{labels.comingSoon}</span></summary><div>{futureItems}</div></details>
    </div>
  </>;
}
