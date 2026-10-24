import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isSupportedLocale } from "@/i18n/routing";
import { hasPasswordIdentity } from "@/lib/auth/password-change";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getOrCreateProfile } from "@/lib/profile/get-or-create-profile";
import { createClient } from "@/lib/supabase/server";

import { AppearanceControl } from "./appearance-control";
import { PasswordChangeControl } from "./password-change-control";
import { ProfileForm } from "./profile-form";
import { SessionManagement } from "./session-management";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { SettingsNavigation } from "./settings-navigation";
import { SettingsIcon } from "./settings-icon";
import { resolveSettingsSection } from "./settings-sections";
import styles from "./settings.module.css";

type AccountPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
};

export default async function AccountPage({ params, searchParams }: AccountPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const selected = resolveSettingsSection((await searchParams).section);
  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Unable to load account.");

  const [profile, t, supabase] = await Promise.all([
    getOrCreateProfile(userId),
    getTranslations({ locale, namespace: "Dashboard.account" }),
    createClient(),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  const providers = user?.identities?.map((identity) => identity.provider) ?? [];
  const passwordEmail = user?.email;
  const canChangePassword = Boolean(passwordEmail && hasPasswordIdentity(providers));
  const signInMethod = providers.includes("google") ? t("googleSignIn") : t("emailSignIn");
  setRequestLocale(locale);

  const passwordMessages = {
    cancel: t("cancel"), changePassword: t("changePassword"), codeLabel: t("codeLabel"), confirmPassword: t("confirmPassword"),
    done: t("done"), emailVerificationDescription: t("emailVerificationDescription"), invalidNonce: t("invalidNonce"), network: t("network"),
    newPassword: t("newPassword"), passwordMismatch: t("passwordMismatch"), passwordRequired: t("passwordRequired"), rateLimited: t("rateLimited"),
    requestSent: t("requestSent"), resend: t("resend"), resendCountdown: t("resendCountdown", { seconds: "{seconds}" }), sendCode: t("sendCode"),
    sendingCode: t("sendingCode"), sessionExpired: t("sessionExpired"), sessionExpiredAction: t("sessionExpiredAction"), successDescription: t("successDescription"),
    successTitle: t("successTitle"), unknown: t("unknown"), updatePassword: t("updatePassword"), updatingPassword: t("updatingPassword"),
    verifyTitle: t("verifyTitle"), weakPassword: t("weakPassword"),
  };

  return <main className="dashboard-main"><div className="dashboard-main-inner dashboard-container">
    <section className={styles.workspace} aria-labelledby="account-heading">
      <header className={styles.header}>
        <h1 id="account-heading">{t("settingsHeading")}</h1><p>{t("settingsDescription")}</p>
      </header>
      <div className={styles.layout}>
        <SettingsNavigation selected={selected} labels={{
          navigation: t("settingsNavigation"), current: t("currentGroup"), upcoming: t("upcomingGroup"), comingSoon: t("comingSoon"), selector: t("settingsSection"),
          sections: { profile: t("profileNavLabel"), security: t("securityNavLabel"), sessions: t("sessions"), appearance: t("appearanceLanguageLabel") },
          future: { notifications: t("notificationsNavLabel"), usage: t("usageNavLabel"), brands: t("brandKitsNavLabel"), team: t("teamNavLabel"), integrations: t("integrationsNavLabel") },
        }} />
        <div className={styles.content}>
          {selected === "profile" ? <section id="account-settings" className="dashboard-settings-card account-profile-card" aria-labelledby="profile-heading">
            <div className="account-section-header"><span className="account-section-icon"><SettingsIcon name="profile" /></span><div><p>{t("profileEyebrow")}</p><h2 id="profile-heading">{t("profileHeading")}</h2><span>{t("profileDescription")}</span></div></div>
            <ProfileForm displayName={profile.display_name} messages={{ profileLabel: t("profileLabel"), displayNameLabel: t("displayNameLabel"), displayNameHelper: t("displayNameHelper"), save: t("save"), saving: t("saving"), validationError: t("validationError"), saveError: t("saveError"), saveSuccess: t("saveSuccess") }} />
            <dl className={styles.profileDetails} aria-label={t("summaryLabel")}>
              {user?.email ? <div><dt>{t("emailLabel")}</dt><dd>{user.email}<span className={styles.emailStatus}>{t(user.email_confirmed_at ? "verifiedEmail" : "unverifiedEmail")}</span></dd></div> : null}
              <div><dt>{t("signInMethod")}</dt><dd>{signInMethod}</dd></div>
              <div><dt>{t("accountStatus")}</dt><dd>{t("activeStatus")}</dd></div>
            </dl>
          </section> : null}
          {selected === "security" ? <section id="security-settings" className="dashboard-settings-card" aria-labelledby="security-heading">
            <div className="account-section-header"><span className="account-section-icon"><SettingsIcon name="security" /></span><div><p>{t("securityEyebrow")}</p><h2 id="security-heading">{t("securityHeading")}</h2><span>{t("securityDescription")}</span></div></div>
            {canChangePassword ? <div className="security-action-row"><span className="security-action-icon"><SettingsIcon name="security" /></span><div><h3>{t("passwordHeading")}</h3><p>{t("passwordDescription")}</p></div><PasswordChangeControl email={passwordEmail!} signInHref={`/${locale}/login`} messages={passwordMessages} /></div> : <p className={styles.notice}>{t(providers.includes("google") ? "googlePasswordNotice" : "noPasswordNotice")}</p>}
          </section> : null}
          {selected === "sessions" ? <section className="dashboard-settings-card account-sessions-card" aria-labelledby="sessions-section-heading">
            <div className="account-section-header"><span className="account-section-icon"><SettingsIcon name="sessions" /></span><div><p>{t("sessionsEyebrow")}</p><h2 id="sessions-section-heading">{t("sessionsHeading")}</h2><span>{t("sessionsDescription")}</span></div></div>
            <SessionManagement signInHref={`/${locale}/login`} messages={{
              sessions: t("sessions"), currentSession: t("currentSession"), activeNow: t("activeNow"), current: t("current"),
              signOutDevice: t("signOutDevice"), signingOut: t("signingOut"), signOutOthers: t("signOutOthers"),
              signOutOthersDescription: t("signOutOthersDescription"), signingOutOthers: t("signingOutOthers"),
              signOutEverywhere: t("signOutEverywhere"), signingOutEverywhere: t("signingOutEverywhere"),
              othersTitle: t("othersTitle"), othersBody: t("othersBody"), confirmOthers: t("confirmOthers"),
              globalTitle: t("globalTitle"), globalBody: t("globalBody"), confirmGlobal: t("confirmGlobal"),
              cancel: t("sessionsCancel"), error: t("sessionsError"), localDescription: t("signOutDeviceDescription"),
              dangerZone: t("dangerZone"), globalDescription: t("signOutEverywhereDescription"),
            }} />
          </section> : null}
          {selected === "appearance" ? <section id="appearance-settings" className="dashboard-settings-card" aria-labelledby="appearance-heading">
            <div className="account-section-header"><span className="account-section-icon"><SettingsIcon name="appearance" /></span><div><p>{t("appearanceEyebrow")}</p><h2 id="appearance-heading">{t("appearanceHeading")}</h2><span>{t("appearanceDescription")}</span></div></div>
            <AppearanceControl labels={{ group: t("themeLabel"), system: t("system"), dark: t("dark"), light: t("light") }} />
            <div className={styles.languageRow}><div><h3>{t("languageHeading")}</h3><p>{t("languageDescription")}</p></div><LanguageSwitcher variant="dashboard" /></div>
          </section> : null}
        </div>
      </div>
    </section>
  </div></main>;
}
