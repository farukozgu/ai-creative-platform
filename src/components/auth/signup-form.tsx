"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type SignupStep = "email" | "password" | "verify";

type SignupFormProps = {
  showConfirmationError?: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm({showConfirmationError = false}: SignupFormProps) {
  const t = useTranslations("SignupPage");
  const locale = useLocale();
  const [step, setStep] = useState<SignupStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [notice, setNotice] = useState<string | undefined>(
    showConfirmationError ? t("confirmationError") : undefined,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const verificationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.motion = "ready";
  }, []);

  useEffect(() => {
    if (step === "verify") {
      verificationRef.current?.focus();
    }
  }, [step]);

  function focusOnNextFrame(target: "email" | "password") {
    window.requestAnimationFrame(() => {
      (target === "email" ? emailRef : passwordRef).current?.focus();
    });
  }

  function handleEmailContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    setEmail(normalizedEmail);
    setEmailError(undefined);
    setStep("password");
    focusOnNextFrame("password");
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    setNotice(undefined);

    if (password.length < 8) {
      setPasswordError(t("passwordTooShort"));
      passwordRef.current?.focus();
      return;
    }

    setPasswordError(undefined);
    setIsSubmitting(true);

    const callbackPath = `/${locale}/auth/callback?next=${encodeURIComponent(
      `/${locale}/dashboard`,
    )}`;

    try {
      const supabase = createClient();
      const {error} = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${callbackPath}`,
        },
      });

      if (error) {
        const isRateLimited =
          error.status === 429 || /rate limit|too many/i.test(error.message);
        setNotice(t(isRateLimited ? "rateLimitError" : "signupError"));
        return;
      }

      setPassword("");
      setStep("verify");
    } catch {
      setNotice(t("signupError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleContinue() {
    setNotice(t("googleUnavailable"));
  }

  function handleChangeEmail() {
    setStep("email");
    setPassword("");
    setPasswordError(undefined);
    setNotice(undefined);
    focusOnNextFrame("email");
  }

  const isEmailStep = step === "email";

  if (step === "verify") {
    return (
      <section
        ref={verificationRef}
        className="signup-form-wrap"
        tabIndex={-1}
        aria-live="polite"
      >
        <div className="signup-form-stage">
          <div className="signup-form-heading">
            <p className="signup-eyebrow">{t("verifyEyebrow")}</p>
            <h1>{t("verifyHeading")}</h1>
            <p>{t("verifyDescription", {email})}</p>
          </div>
          <p className="signup-notice" role="status">
            {t("verifyHelper")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="signup-form-wrap">
      <div className="signup-progress" aria-hidden="true">
        <span data-active={isEmailStep} />
        <span data-active={!isEmailStep} />
      </div>
      <p className="sr-only">
        {isEmailStep ? t("progressStepOne") : t("progressStepTwo")}
      </p>

      <form
        className="signup-form"
        noValidate
        onSubmit={isEmailStep ? handleEmailContinue : handleCreateAccount}
      >
        {isEmailStep ? (
          <div key="email" className="signup-form-stage">
            <div className="signup-form-heading">
              <h1>{t("heading")}</h1>
              <p>{t("description")}</p>
            </div>

            <div className="signup-field-group">
              <label className="signup-label" htmlFor="signup-email">
                {t("emailLabel")}
              </label>
              <input
                ref={emailRef}
                id="signup-email"
                className="signup-input"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                placeholder={t("emailPlaceholder")}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "signup-email-error" : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(undefined);
                }}
              />
              {emailError ? (
                <p id="signup-email-error" className="signup-field-error" role="alert">
                  <span aria-hidden="true" className="signup-error-mark">
                    !
                  </span>
                  {emailError}
                </p>
              ) : null}
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full">
              {t("continue")}
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
              {t("existingAccount")}{" "}
              <Link href="/login">{t("signIn")}</Link>
            </p>
          </div>
        ) : (
          <div key="password" className="signup-form-stage">
            <Button variant="ghost" size="sm"
              type="button"
              className="signup-back-button"
              onClick={handleChangeEmail}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16">
                <path d="m10 3-5 5 5 5" />
              </svg>
              {t("changeEmail")}
            </Button>

            <div className="signup-form-heading">
              <h1>{t("passwordHeading")}</h1>
              <p>{t("passwordDescription")}</p>
              <p className="signup-selected-email">{email}</p>
            </div>

            <PasswordField
              id="signup-password"
              autoComplete="new-password"
              minLength={8}
              inputRef={passwordRef}
              label={t("passwordLabel")}
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
              {isSubmitting ? t("submitting") : t("createAccount")}
            </Button>

            <p className="signup-terms">
              {t("termsPrefix")}
              <Link href="/terms">{t("termsLink")}</Link>
              <Link href="/privacy">{t("privacyLink")}</Link>
              {t("termsSuffix")}
            </p>
          </div>
        )}
      </form>

      {notice ? (
        <p className="signup-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
