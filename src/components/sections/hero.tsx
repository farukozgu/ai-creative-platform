import { getLocale, getTranslations } from "next-intl/server";

import { HeroWorkspace } from "@/components/sections/hero-workspace";
import { AnimatedHeading } from "@/components/motion/animated-heading";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config/site";
import { getPathname } from "@/i18n/navigation";

export async function Hero() {
  const locale = await getLocale();
  const t = await getTranslations("Hero");

  return (
    <Section
      id="product"
      aria-labelledby="hero-title"
      className="hero-section bg-[var(--background)] pt-[clamp(3.5rem,7vw,6.5rem)]"
      spacing="compact"
    >
      <Container>
        <header className="hero-heading mx-auto flex max-w-[82rem] flex-col items-center text-center">
          <AnimatedHeading
            as="h1"
            id="hero-title"
            variant="section"
            lines={[t("titleLead"), t("titleTrail")]}
            className="hero-title w-full max-w-[60rem] text-[clamp(2rem,10vw,4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[var(--foreground)]"
          />
          <p className="hero-description max-w-2xl text-base leading-7 text-[var(--foreground-muted)] sm:text-lg sm:leading-8">
            {t("description")}
          </p>
          <Button
            href={getPathname({
              href: siteConfig.routes.signup,
              locale,
            })}
            className="hero-cta mt-8"
            size="lg"
            variant="primary"
          >
            {t("primaryCta")}
          </Button>
        </header>

        <div className="mt-12 sm:mt-14 lg:mt-16">
          <HeroWorkspace />
        </div>
      </Container>
    </Section>
  );
}
