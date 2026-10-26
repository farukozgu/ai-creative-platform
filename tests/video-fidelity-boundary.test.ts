import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { createTranslator } from "next-intl";
import type { ReactElement } from "react";

import tr from "../src/messages/tr.json";
import en from "../src/messages/en.json";
import type { VideoFidelityCopy } from "../src/features/video/video-fidelity-analysis";

type Page = (input: { params: Promise<{ locale: string; videoId: string }> }) => Promise<ReactElement<{
  copy: { fidelity: VideoFidelityCopy };
  fidelityAvailability: { enabled: boolean; maximumEstimatedCostUsd: number | null };
}>>;

for (const locale of ["tr", "en"] as const) {
  test(`${locale}: the real detail page passes cloneable data to the fidelity client boundary`, async () => {
    const messages = locale === "tr" ? tr : en;
    const dependencies: Record<string, unknown> = {
      "react/jsx-runtime": jsxRuntime,
      "next/navigation": { notFound: () => { throw new Error("Unexpected notFound"); } },
      "next-intl/server": {
        setRequestLocale: () => undefined,
        getTranslations: async ({ namespace }: { namespace: "Dashboard.videoDetail" | "Dashboard.videoStudio" }) =>
          createTranslator({ locale, messages, namespace, onError: error => { throw error; } }),
      },
      "@/features/video/video-detail": { VideoDetail: () => null },
      "@/i18n/routing": { isSupportedLocale: (value: string) => value === "tr" || value === "en" },
      "@/app/[locale]/dashboard/video/generation-actions": {
        readVideoGenerationAction: async () => ({ id: "owned-completed-job", status: "ready" }),
      },
      "@/lib/auth/require-user": { getAuthenticatedUserId: async () => "test-owner" },
      "@/lib/video-fidelity/availability": {
        getVideoFidelityAnalysisAvailability: () => ({ enabled: false, maximumEstimatedCostUsd: null }),
      },
    };
    const exports: Record<string, unknown> = {};
    const compiled = ts.transpileModule(readFileSync("src/app/[locale]/dashboard/videos/[videoId]/page.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(compiled, { exports, require(name: string) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    } });
    const page = await (exports.default as Page)({ params: Promise.resolve({ locale, videoId: "owned-completed-job" }) });
    const clientProps = { copy: page.props.copy.fidelity, availability: page.props.fidelityAvailability };
    // Unlike JSON.stringify, structuredClone rejects a nested translation function.
    assert.doesNotThrow(() => structuredClone(clientProps));
    assert.equal(clientProps.copy.title, messages.Dashboard.videoDetail.fidelityAnalysis.title);
    assert.equal(clientProps.copy.statuses.unverified, messages.Dashboard.videoDetail.fidelityAnalysis.statuses.unverified);
  });
}
