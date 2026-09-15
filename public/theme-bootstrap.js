let savedTheme;
let savedColor;
try {
  savedTheme = localStorage.getItem("rangkumin-theme");
  savedColor = localStorage.getItem("rangkumin-color-mode");
} catch {
  // Private browsing policies can block storage; system mode remains the default.
}

const theme =
  savedTheme === "calm" || savedTheme === "minimal" ? savedTheme : "together";
const preference =
  savedColor === "light" || savedColor === "dark" ? savedColor : "system";
const prefersDark =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-color-scheme: dark)").matches;
const mode = preference === "system" ? (prefersDark ? "dark" : "light") : preference;
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.colorPreference = preference;
document.documentElement.dataset.colorMode = mode;

const lightColors = {
  together: "#f8f0e9",
  calm: "#f3f0e8",
  minimal: "#f7f7f4",
};
const darkColors = {
  together: "#1d1818",
  calm: "#121c18",
  minimal: "#151719",
};
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute("content", (mode === "dark" ? darkColors : lightColors)[theme]);
