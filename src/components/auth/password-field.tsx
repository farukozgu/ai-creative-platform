"use client";

import { Button } from "@/components/ui/button";

import { useState } from "react";
import type {
  ChangeEventHandler,
  ComponentProps,
  ReactNode,
  RefObject,
} from "react";

type PasswordFieldProps = {
  autoComplete: ComponentProps<"input">["autoComplete"];
  error?: string;
  hideLabel: string;
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  labelAction?: ReactNode;
  minLength?: number;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  showLabel: string;
  value: string;
};

export function PasswordField({
  autoComplete,
  error,
  hideLabel,
  id,
  inputRef,
  label,
  labelAction,
  minLength,
  onChange,
  placeholder,
  showLabel,
  value,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const errorId = `${id}-error`;

  return (
    <div className="signup-field-group">
      <div className="signup-label-row">
        <label className="signup-label" htmlFor={id}>
          {label}
        </label>
        {labelAction}
      </div>
      <div className="signup-password-wrap">
        <input
          ref={inputRef}
          id={id}
          className="signup-input signup-password-input"
          type={isVisible ? "text" : "password"}
          name="password"
          autoComplete={autoComplete}
          minLength={minLength}
          required
          value={value}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={onChange}
        />
        <Button variant="icon" size="sm"
          type="button"
          className="signup-password-toggle"
          aria-label={isVisible ? hideLabel : showLabel}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((current) => !current)}
        >
          {isVisible ? (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m4 4 16 16M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a17.5 17.5 0 0 1-2.2 3.2M6.6 6.7C4.2 8.5 3 12 3 12s3.5 7 9 7c1 0 2-.2 2.9-.6" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          )}
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="signup-field-error" role="alert">
          <span aria-hidden="true" className="signup-error-mark">
            !
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
