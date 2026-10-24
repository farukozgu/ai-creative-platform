import Link from "next/link";
import type { ComponentProps, ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "dark";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonBaseProps {
  children?: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

type ButtonAsButtonProps = ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
    ref?: Ref<HTMLButtonElement>;
  };

type ButtonAsLinkProps = ButtonBaseProps &
  Omit<ComponentProps<typeof Link>, "children" | "className"> & {
    href: ComponentProps<typeof Link>["href"];
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

type ButtonVariantClasses = {
  button: string;
  fill: string;
};

const variantClasses: Record<ButtonVariant, ButtonVariantClasses> = {
  primary: {
    button: "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--surface)]",
    fill: "bg-[var(--foreground-muted)] motion-reduce:!translate-y-full",
  },
  secondary: {
    button: "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]",
    fill: "bg-[var(--surface-soft)] motion-reduce:!translate-y-full",
  },
  ghost: {
    button:
      "border-transparent bg-transparent text-[var(--foreground)] [@media(hover:hover)]:hover:text-[var(--foreground)]",
    fill:
      "top-auto bottom-0 h-px translate-y-0 origin-left scale-x-0 bg-[var(--foreground)] [@media(hover:hover)]:group-hover:scale-x-100 motion-reduce:!translate-y-0 motion-reduce:!scale-x-0",
  },
  dark: {
    button: "border-[var(--button-primary-bg)] bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]",
    fill: "bg-[var(--foreground-muted)] motion-reduce:!translate-y-full",
  },
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-6 text-base",
};

function ButtonContent({
  children,
  fillClassName,
}: {
  children: ReactNode;
  fillClassName: string;
}) {
  const isTextLabel =
    typeof children === "string" || typeof children === "number";

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-0 translate-y-full transition-transform duration-(--button-transition-duration) ease-(--button-transition-ease) [@media(hover:hover)]:group-hover:translate-y-0 motion-reduce:transition-none",
          fillClassName,
        )}
      />
      {isTextLabel ? (
        <span className="relative z-10 inline-flex items-center justify-center">
          <span className="sr-only">{children}</span>
          <span
            aria-hidden="true"
            className="button-label-viewport text-inherit"
          >
            <span className="button-label-copy button-label-copy-current">
              {children}
            </span>
            <span className="button-label-copy button-label-copy-next">
              {children}
            </span>
          </span>
        </span>
      ) : (
        <span className="button-label-fallback relative z-10 inline-flex items-center justify-center text-inherit">
          {children}
        </span>
      )}
    </>
  );
}

export function Button(props: ButtonProps) {
  const {
    children,
    className,
    variant = "primary",
    size = "md",
  } = props;
  const buttonClassName = cn(
    "button-roll group relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-[var(--radius-md)] border font-medium tracking-[-0.01em] shadow-[var(--shadow-subtle)] transition-[background-color,border-color,color,transform] duration-(--button-transition-duration) ease-(--button-transition-ease) [@media(hover:hover)]:hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--foreground)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none",
    variantClasses[variant].button,
    sizeClasses[size],
    className,
  );

  if ("href" in props && props.href !== undefined) {
    const { href, ...linkProps } = props;
    delete linkProps.children;
    delete linkProps.className;
    delete linkProps.variant;
    delete linkProps.size;

    return (
      <Link className={buttonClassName} href={href} {...linkProps}>
        <ButtonContent fillClassName={variantClasses[variant].fill}>
          {children}
        </ButtonContent>
      </Link>
    );
  }

  const buttonProps = { ...props, type: props.type ?? "button" };
  delete buttonProps.children;
  delete buttonProps.className;
  delete buttonProps.variant;
  delete buttonProps.size;
  delete buttonProps.href;

  return (
    <button className={buttonClassName} {...buttonProps}>
      <ButtonContent fillClassName={variantClasses[variant].fill}>
        {children}
      </ButtonContent>
    </button>
  );
}
