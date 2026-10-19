import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "accent" | "outline";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border-transparent bg-[color-mix(in_srgb,var(--surface)_45%,var(--surface-soft))] text-[var(--foreground)]",
  accent:
    "border-transparent bg-[color-mix(in_srgb,var(--surface)_45%,var(--surface-soft))] text-[var(--foreground)]",
  outline:
    "border-transparent bg-[color-mix(in_srgb,var(--surface)_45%,var(--surface-soft))] text-[var(--foreground)]",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius)] border px-3 py-1.5 text-xs font-medium leading-5 tracking-[-0.01em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
