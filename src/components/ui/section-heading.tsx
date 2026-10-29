import { Badge } from "@/components/ui/badge";
import { AnimatedHeading } from "@/components/motion/animated-heading";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/cn";

type SectionHeadingAlign = "left" | "center";

export interface SectionHeadingProps {
  as?: "h1" | "h2";
  eyebrow?: string;
  title: string;
  description?: string;
  align?: SectionHeadingAlign;
  className?: string;
  titleClassName?: string;
  titleId?: string;
}

const alignmentClasses: Record<SectionHeadingAlign, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
};

export function SectionHeading({
  as = "h2",
  eyebrow,
  title,
  description,
  align = "left",
  className,
  titleClassName,
  titleId,
}: SectionHeadingProps) {
  return (
    <header
      className={cn(
        "flex max-w-4xl flex-col gap-5",
        alignmentClasses[align],
        className,
      )}
    >
      {eyebrow ? <Reveal variant="fade"><Badge>{eyebrow}</Badge></Reveal> : null}
      <AnimatedHeading
        as={as}
        id={titleId}
        lines={title.split("\n")}
        className={cn("text-[length:var(--text-heading-1)] font-semibold leading-[var(--leading-heading)] tracking-[var(--tracking-heading)] text-[var(--foreground)]", titleClassName)}
      />
      {description ? (
        <Reveal delay={100} className="max-w-2xl"><p className="text-base leading-7 text-[var(--foreground-muted)] sm:text-lg sm:leading-8">
          {description}
        </p></Reveal>
      ) : null}
    </header>
  );
}
