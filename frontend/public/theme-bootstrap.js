try {
  const saved = localStorage.getItem("rangkumin-theme");
  document.documentElement.dataset.theme =
    saved === "calm" || saved === "minimal" ? saved : "together";
} catch {
  document.documentElement.dataset.theme = "together";
}
