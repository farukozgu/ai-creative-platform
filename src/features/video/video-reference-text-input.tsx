"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { parseReferenceDeclaredText, supportsReferenceDeclaredText } from "@/lib/video-generation/product-references";
import styles from "./video-studio-workspace.module.css";

export function VideoReferenceTextInput({ purpose, value, disabled, onChange }: {
  purpose: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const t = useTranslations("Dashboard.videoStudio.references");
  const [invalid, setInvalid] = useState(false);
  if (!supportsReferenceDeclaredText(purpose)) return null;
  return <div>
    <label className={styles.regionText}>{t("declaredText")}
      <input type="text" maxLength={80} value={value} disabled={disabled} aria-invalid={invalid}
        onChange={event => {
          const text = event.currentTarget.value;
          const valid = parseReferenceDeclaredText(text) !== null;
          setInvalid(!valid);
          if (valid) onChange(text);
        }} onBlur={() => onChange(value.trim())}
        onPaste={event => {
          if (parseReferenceDeclaredText(event.clipboardData.getData("text")) === null) {
            event.preventDefault(); setInvalid(true);
          }
        }} />
    </label>
    {invalid ? <p className={styles.referenceError} role="alert">{t("declaredTextError")}</p> : null}
  </div>;
}
