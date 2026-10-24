import { ThemePreferenceControl, type ThemePreferenceControlProps } from "@/components/theme/theme-preference-control";

export function AppearanceControl({ labels }: Pick<ThemePreferenceControlProps, "labels">) {
  return <ThemePreferenceControl labels={labels} />;
}
