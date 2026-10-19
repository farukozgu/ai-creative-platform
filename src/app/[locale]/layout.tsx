import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isSupportedLocale, routing } from "@/i18n/routing";
import { ThemeInitScript } from "@/components/theme/theme-init-script";
import { ThemeProviderBoundary } from "@/components/theme/theme-provider-boundary";

import "../globals.css";

const googleSans = localFont({
  src: [
    {
      path: "../../../public/Google_Sans/GoogleSans-VariableFont_GRAD,opsz,wght.ttf",
      weight: "400 700",
      style: "normal",
    },
    {
      path: "../../../public/Google_Sans/GoogleSans-Italic-VariableFont_GRAD,opsz,wght.ttf",
      weight: "400 700",
      style: "italic",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  preload: true,
});

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: {
      default: t("title"),
      template: "%s | Klay.ai",
    },
    applicationName: "Klay.ai",
    description: t("description"),
    openGraph: {
      title: "Klay.ai",
      description: t("description"),
      siteName: "Klay.ai",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Klay.ai",
      description: t("description"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<LocaleLayoutProps>) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      data-theme="light"
      data-theme-preference="system"
      data-theme-preference-source="default"
      suppressHydrationWarning
    >
      <head><ThemeInitScript /></head>
      <body className={googleSans.variable}>
        <ThemeProviderBoundary><NextIntlClientProvider>{children}</NextIntlClientProvider></ThemeProviderBoundary>
      </body>
    </html>
  );
}
