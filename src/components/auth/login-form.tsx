"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const t = useTranslations("LoginPage");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.motion = "ready";
  }, []);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    setNotice(undefined);

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setEmailError(t("emailRequired"));
      emailRef.current?.focus();
      return;
    }

    if (!emailPattern.test(normalizedEmail)) {
      setEmailError(t("emailInvalid"));
      emailRef.current?.focus();
      return;
    }

    if (!password) {
      setEmail(normalizedEmail);
      setEmailError(undefined);
      setPasswordError(t("passwordRequired"));
      passwordRef.current?.focus();
      return;
    }

    setEmail(normalizedEmail);
    setEmailError(undefined);
    setPasswordError(undefined);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const {error} = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        const errorMessage = error.message.toLowerCase();
        const isRateLimited =
          error.status === 429 ||
          /rate limit|too many|request limit/.test(errorMessage);
        const isUnconfirmed =
          error.code === "email_not_confirmed" ||
          /email not confirmed|email.*confirm/.test(errorMessage);

        if (isRateLimited) {
          setNotice(t("rateLimitError"));
        } else if (isUnconfirmed) {
          setNotice(t("emailNotConfirmed"));
        } else if (
          error.code === "invalid_credentials" ||
          error.status === 400
        ) {
          setNotice(t("invalidCredentials"));
        } else {
          setNotice(t("genericError"));
        }

        return;
      }

      setPassword("");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setNotice(t("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleContinue() {
    setNotice(t("googleUnavailable"));
  }

  function handleForgotPassword() {
    setNotice(t("forgotUnavailable"));
  }

  return (
    <div className="signup-form-wrap">
      <form className="signup-form" noValidate onSubmit={handleSignIn}>
        <div className="signup-form-stage login-form-stage">
          <div className="signup-form-heading">
            <h1>{t("heading")}</h1>
            <p>{t("description")}</p>
          </div>

          <div className="signup-field-group">
            <label className="signup-label" htmlFor="login-email">
              {t("emailLabel")}
            </label>
            <input
              ref={emailRef}
              id="login-email"
              className="signup-input"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              placeholder={t("emailPlaceholder")}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "login-email-error" : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError(undefined);
              }}
            />
            {emailError ? (
              <p id="login-email-error" className="signup-field-error" role="alert">
                <span aria-hidden="true" className="signup-error-mark">
                  !
                </span>
                {emailError}
              </p>
            ) : null}
          </div>

          <PasswordField
            id="login-password"
            autoComplete="current-password"
            inputRef={passwordRef}
            label={t("passwordLabel")}
            labelAction={
              <Button variant="ghost" size="sm"
                type="button"
                className="login-forgot-button"
                onClick={handleForgotPassword}
              >
                {t("forgotPassword")}
              </Button>
            }
            placeholder={t("passwordPlaceholder")}
            showLabel={t("showPassword")}
            hideLabel={t("hidePassword")}
            value={password}
            error={passwordError}
            onChange={(event) => {
              setPassword(event.target.value);
              if (passwordError) setPasswordError(undefined);
            }}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? t("signingIn") : t("signIn")}
          </Button>

          <div className="signup-divider" aria-hidden="true">
            <span />
            <p>{t("divider")}</p>
            <span />
          </div>

          <GoogleButton onClick={handleGoogleContinue}>
            {t("continueWithGoogle")}
          </GoogleButton>

          <p className="signup-existing-account">
            {t("noAccount")}{" "}
            <Link href="/signup">{t("createAccount")}</Link>
          </p>
        </div>
      </form>

      {notice ? (
        <p className="signup-notice" role="alert" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
