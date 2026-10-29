import Link from "next/link";
import type { ComponentProps, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "destructive" | "icon" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: "square" | "round";
  className?: string;
};

/** Keep locale-aware Link behavior and apply the same action styles. */
export function buttonStyles({ variant = "primary", size = "md", shape = "square", className }: ButtonStyleOptions = {}) {
  return cn("ui-button", `ui-button--${variant}`, `ui-button--${size}`, shape === "round" && "ui-button--round", className);
}

type ButtonBaseProps = ButtonStyleOptions & { children?: ReactNode };
type ButtonAsButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: never;
  ref?: Ref<HTMLButtonElement>;
  loading?: boolean;
  loadingLabel?: string;
};
type ButtonAsLinkProps = ButtonBaseProps & Omit<ComponentProps<typeof Link>, "children" | "className"> & {
  href: ComponentProps<typeof Link>["href"];
  loading?: never;
  loadingLabel?: never;
};
export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

export function Button(props: ButtonProps) {
  if ("href" in props && props.href !== undefined) {
    const { children, variant, size, shape, className, ...linkProps } = props;
    return <Link {...linkProps} className={buttonStyles({ variant, size, shape, className })}>
      <span className="ui-button__content">{children}</span>
    </Link>;
  }

  const { children, variant, size, shape, className, loading = false, loadingLabel, ...buttonProps } = props as ButtonAsButtonProps;
  const busy = loading || buttonProps["aria-busy"] === true || buttonProps["aria-busy"] === "true";
  return <button
    {...buttonProps}
    type={buttonProps.type ?? "button"}
    className={buttonStyles({ variant, size, shape, className })}
    disabled={buttonProps.disabled || loading}
    aria-busy={busy || buttonProps["aria-busy"]}
  >
    <span className="ui-button__content">
      {busy ? <span className="ui-button__spinner" aria-hidden="true" /> : null}
      {busy && loadingLabel ? loadingLabel : children}
    </span>
  </button>;
}
