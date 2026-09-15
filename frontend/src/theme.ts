export type Theme = "together" | "calm" | "minimal";
export type ColorPreference = "system" | "light" | "dark";
export type ColorMode = "light" | "dark";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "calm" || value === "minimal" ? value : "together";
}

export function parseColorPreference(
  value: string | null | undefined,
): ColorPreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveColorMode(
  preference: ColorPreference,
  prefersDark: boolean,
): ColorMode {
  return preference === "system"
    ? prefersDark
      ? "dark"
      : "light"
    : preference;
}

export function themeColor(theme: Theme, mode: ColorMode): string {
  if (mode === "dark") {
    return theme === "calm"
      ? "#121c18"
      : theme === "minimal"
        ? "#151719"
        : "#1d1818";
  }
  return theme === "calm"
    ? "#f3f0e8"
    : theme === "minimal"
      ? "#f7f7f4"
      : "#f8f0e9";
}
