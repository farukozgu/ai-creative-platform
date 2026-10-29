"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { getPresetPresentationModes, getRecommendedFamilyPresets } from "@/lib/creative-presets/creative-presets";
import type { SupportedVertical } from "@/lib/verticals/supported-verticals";
import type { AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { PresetCategoryFilter, type PresetCategoryFilterValue } from "@/components/dashboard/preset-category-filter";
import { Button } from "@/components/ui/button";
import { creationHref } from "@/features/generation/creation-entry";

const presetCategoryConfig = [
  { value: "all", labelKey: "all", icon: "allCategories" },
  { value: "apparel", labelKey: "apparel", icon: "apparel" },
  { value: "jewelry", labelKey: "jewelry", icon: "jewelry" },
  { value: "watches", labelKey: "watches", icon: "watch" },
  { value: "footwear", labelKey: "footwear", icon: "footwear" },
  { value: "cosmetics", labelKey: "cosmetics", icon: "cosmetics" },
  { value: "bags", labelKey: "bags", icon: "bag" },
] as const satisfies readonly {
  value: PresetCategoryFilterValue;
  labelKey: "all" | SupportedVertical;
  icon: "allCategories" | "apparel" | "jewelry" | "watch" | "footwear" | "cosmetics" | "bag";
}[];

export const DASHBOARD_PRESET_EVENT = "creative-ai:select-preset";
export type DashboardPresetSelection = { presetId: string | null; presentationMode: string | null };
const COLLAPSED_PRESET_COUNT = 6;

export function CreativePresetRail({ vertical }: { vertical?: SupportedVertical | null }) {
  const t = useTranslations("Dashboard.presets");
  const workspaceT = useTranslations("Dashboard.creationWorkspace");
  const locale = useLocale() as AppLocale;
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedPresentationMode, setSelectedPresentationMode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [categoryState, setCategory] = useState<{ vertical: SupportedVertical | null | undefined; value: PresetCategoryFilterValue }>({ vertical, value: vertical ?? "all" });
  const category = categoryState.vertical === vertical ? categoryState.value : vertical ?? "all";
  const allPresets = getRecommendedFamilyPresets({ vertical: null });
  const recommendedPresets = getRecommendedFamilyPresets({ vertical, selectedPresetId });
  const categoryPresets = category === "all"
    ? allPresets
    : allPresets.filter((preset) => preset.vertical === category);
  const compactPresets = category === "all" && vertical
    ? recommendedPresets
    : category === "all" ? allPresets.slice(0, COLLAPSED_PRESET_COUNT) : categoryPresets;
  const selectedPreset = selectedPresetId
    ? allPresets.find((preset) => preset.id === selectedPresetId)
    : undefined;
  const visiblePresets = category !== "all"
    ? categoryPresets
    : expanded
    ? allPresets
    : selectedPreset && !compactPresets.some((preset) => preset.id === selectedPreset.id)
      ? [...compactPresets.slice(0, COLLAPSED_PRESET_COUNT - 1), selectedPreset]
      : compactPresets;

  function selectPreset(id: string) {
    const nextPresetId = selectedPresetId === id ? null : id;
    setSelectedPresetId(nextPresetId);
    setSelectedPresentationMode(null);
    window.dispatchEvent(new CustomEvent<DashboardPresetSelection>(DASHBOARD_PRESET_EVENT, { detail: { presetId: nextPresetId, presentationMode: null } }));
  }

  function selectPresentationMode(mode: string | null) {
    if (!selectedPresetId) return;
    const nextMode = selectedPresentationMode === mode ? null : mode;
    setSelectedPresentationMode(nextMode);
    window.dispatchEvent(new CustomEvent<DashboardPresetSelection>(DASHBOARD_PRESET_EVENT, { detail: { presetId: selectedPresetId, presentationMode: nextMode } }));
  }

  return (
    <div className="dashboard-preset-group">
      <PresetCategoryFilter
        value={category}
        onChange={(value) => setCategory({ vertical, value })}
        label={t("filterLabel")}
        options={presetCategoryConfig.map(({ value, labelKey, icon }) => {
          const count = value === "all"
            ? allPresets.length
            : allPresets.filter((preset) => preset.vertical === value).length;

          return {
            value,
            icon,
            label: t(`filterCategories.${labelKey}`),
            countLabel: t("styleCount", { count }),
          };
        })}
      />
      {selectedPreset && !visiblePresets.some((preset) => preset.id === selectedPreset.id) ? (
        <p className="preset-category-selection">{t("selectedPresetFamily", { title: selectedPreset.localizedTitle[locale] })}</p>
      ) : null}
      <div className="dashboard-template-rail" aria-label={t("listLabel")}>
        {visiblePresets.map((preset) => (
          <button
          key={preset.id}
          type="button"
          className={cn("dashboard-template-card", selectedPresetId === preset.id && "is-selected")}
          aria-label={t("usePreset", { title: preset.localizedTitle[locale] })}
          aria-pressed={selectedPresetId === preset.id}
          onClick={() => selectPreset(preset.id)}
          >
            <span className="dashboard-template-media">
            <Image
              src={preset.thumbnail}
              alt={preset.localizedTitle[locale]}
              fill
              loading="lazy"
              sizes="(min-width: 1600px) 25vw, (min-width: 1200px) 33vw, (min-width: 700px) 50vw, 100vw"
              style={{ objectPosition: preset.objectPosition }}
            />
            {selectedPresetId === preset.id ? <span className="dashboard-template-check" aria-hidden="true">✓</span> : null}
            </span>
            <span className="dashboard-template-copy">
              <span>
                <small>{t(`categories.${preset.category}`)}</small>
                <strong>{preset.localizedTitle[locale]}</strong>
                <span>{t(`familyDescriptions.${preset.id}`)}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
      {selectedPreset ? <section className="preset-presentation-selector" aria-labelledby="preset-presentation-heading">
        <Button href={creationHref({ presetId: selectedPresetId, presentationMode: selectedPresentationMode })}>{workspaceT("open")}</Button>
        <div className="preset-presentation-heading">
          <div><h3 id="preset-presentation-heading">{t("presentationHeading")}</h3><p>{t("presentationDescription")}</p></div>
        <span>{t("presentationFor", { title: selectedPreset.localizedTitle[locale] })}</span>
        </div>
        <div className="preset-presentation-options" role="radiogroup" aria-label={t("presentationHeading")}>
          <button type="button" role="radio" aria-checked={selectedPresentationMode === null} className={cn("preset-presentation-option", selectedPresentationMode === null && "is-selected")} onClick={() => selectPresentationMode(null)}>
            <span aria-hidden="true">✦</span><span><strong>{t("presentationAutomatic")}</strong><small>{t("presentationAutomaticDescription")}</small></span>
          </button>
          {getPresetPresentationModes(selectedPreset.id).map((mode) => <button key={mode.id} type="button" role="radio" aria-checked={selectedPresentationMode === mode.id} className={cn("preset-presentation-option", selectedPresentationMode === mode.id && "is-selected")} onClick={() => selectPresentationMode(mode.id)}>
            <span aria-hidden="true">◈</span><span><strong>{t(`presentationModes.${mode.id}`)}</strong><small>{t.has(`presentationModeDescriptions.${selectedPreset.id}.${mode.id}`) ? t(`presentationModeDescriptions.${selectedPreset.id}.${mode.id}`) : `${t(`presentationModes.${mode.id}`)} — ${selectedPreset.localizedDescription[locale]}`}</small></span>
          </button>)}
        </div>
      </section> : null}
      {category === "all" && (allPresets.length > COLLAPSED_PRESET_COUNT || expanded) ? <div className="dashboard-preset-actions">
        <Button variant="ghost" size="sm"
          className="dashboard-preset-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("showLess") : t("viewAll")}
        </Button>
      </div> : null}
    </div>
  );
}
