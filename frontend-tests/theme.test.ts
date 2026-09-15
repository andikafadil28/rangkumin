import { describe, expect, it } from "vitest";
import {
  parseColorPreference,
  parseTheme,
  resolveColorMode,
  themeColor,
} from "../frontend/src/theme";

describe("theme preference", () => {
  it("mempertahankan tema lama dan memakai fallback aman", () => {
    expect(parseTheme("calm")).toBe("calm");
    expect(parseTheme("unknown")).toBe("together");
  });

  it("mengikuti preferensi perangkat hanya pada mode otomatis", () => {
    expect(parseColorPreference(null)).toBe("system");
    expect(resolveColorMode("system", true)).toBe("dark");
    expect(resolveColorMode("system", false)).toBe("light");
    expect(resolveColorMode("light", true)).toBe("light");
  });

  it("menyediakan warna browser chrome sesuai tema dan mode", () => {
    expect(themeColor("together", "light")).toBe("#f8f0e9");
    expect(themeColor("minimal", "dark")).toBe("#151719");
  });
});
