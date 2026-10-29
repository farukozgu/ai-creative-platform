"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type FieldName = "name" | "email" | "topic" | "message";
type FormErrors = Partial<Record<FieldName, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const minimumMessageLength = 20;

export function ContactForm() {
  const t = useTranslations("ContactPage");
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    document.documentElement.dataset.motion = "ready";
  }, []);

  function clearFieldError(field: FieldName) {
    setNotice(undefined);
    setErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(undefined);

    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const topic = String(data.get("topic") ?? "");
    const message = String(data.get("message") ?? "").trim();
    const nextErrors: FormErrors = {};

    if (!name) nextErrors.name = t("nameRequired");
    if (!email) {
      nextErrors.email = t("emailRequired");
    } else if (!emailPattern.test(email)) {
      nextErrors.email = t("emailInvalid");
    }
    if (!topic) nextErrors.topic = t("topicRequired");
    if (!message) {
      nextErrors.message = t("messageRequired");
    } else if (message.length < minimumMessageLength) {
      nextErrors.message = t("messageTooShort", {
        minimum: minimumMessageLength,
      });
    }

    setErrors(nextErrors);

    const firstInvalidField = (
      ["name", "email", "topic", "message"] as const
    ).find((field) => nextErrors[field]);

    if (firstInvalidField) {
      const invalidControl = form.elements.namedItem(firstInvalidField);
      if (invalidControl instanceof HTMLElement) invalidControl.focus();
      return;
    }

    setNotice(t("unavailable"));
  }

  function describedBy(field: FieldName) {
    return errors[field] ? `contact-${field}-error` : undefined;
  }

  return (
    <div className="contact-form-wrap">
      <header className="contact-form-heading">
        <div className="contact-heading-mask">
          <h1 id="contact-heading">{t("heading")}</h1>
        </div>
        <p>{t("description")}</p>
      </header>

      <form
        className="contact-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <ContactField
          id="contact-name"
          label={t("nameLabel")}
          error={errors.name}
        >
          <input
            id="contact-name"
            className="contact-control"
            type="text"
            name="name"
            autoComplete="name"
            required
            placeholder={t("namePlaceholder")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name")}
            onChange={() => clearFieldError("name")}
          />
        </ContactField>

        <ContactField
          id="contact-email"
          label={t("emailLabel")}
          error={errors.email}
        >
          <input
            id="contact-email"
            className="contact-control"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder={t("emailPlaceholder")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("email")}
            onChange={() => clearFieldError("email")}
          />
        </ContactField>

        <ContactField
          id="contact-company"
          label={t("companyLabel")}
          optional={t("optional")}
        >
          <input
            id="contact-company"
            className="contact-control"
            type="text"
            name="company"
            autoComplete="organization"
            placeholder={t("companyPlaceholder")}
            onChange={() => setNotice(undefined)}
          />
        </ContactField>

        <ContactField
          id="contact-topic"
          label={t("topicLabel")}
          error={errors.topic}
        >
          <div className="contact-select-wrap">
            <select
              id="contact-topic"
              className="contact-control contact-select"
              name="topic"
              required
              defaultValue=""
              aria-invalid={Boolean(errors.topic)}
              aria-describedby={describedBy("topic")}
              onChange={() => clearFieldError("topic")}
            >
              <option value="" disabled>
                {t("topicPlaceholder")}
              </option>
              <option value="pilot">{t("topics.pilot")}</option>
              <option value="pricing">{t("topics.pricing")}</option>
              <option value="partnership">{t("topics.partnership")}</option>
              <option value="technical">{t("topics.technical")}</option>
              <option value="other">{t("topics.other")}</option>
            </select>
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </div>
        </ContactField>

        <ContactField
          id="contact-message"
          label={t("messageLabel")}
          error={errors.message}
        >
          <textarea
            id="contact-message"
            className="contact-control contact-textarea"
            name="message"
            rows={4}
            minLength={minimumMessageLength}
            required
            placeholder={t("messagePlaceholder")}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={describedBy("message")}
            onChange={() => clearFieldError("message")}
          />
        </ContactField>

        <div className="contact-submit-group">
          <Button type="submit" variant="primary" size="lg" className="w-full">
            {t("submit")}
          </Button>
          <p className="contact-helper">{t("helper")}</p>
        </div>
      </form>

      {notice ? (
        <p className="contact-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

type ContactFieldProps = {
  children: React.ReactNode;
  error?: string;
  id: string;
  label: string;
  optional?: string;
};

function ContactField({
  children,
  error,
  id,
  label,
  optional,
}: ContactFieldProps) {
  return (
    <div className="contact-field">
      <label className="contact-label" htmlFor={id}>
        <span>{label}</span>
        {optional ? <span className="contact-optional">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="contact-field-error" role="alert">
          <span aria-hidden="true" className="contact-error-mark">
            !
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
