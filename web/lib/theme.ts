export type Theme = "light" | "dark";

const STORAGE_KEY = "backwegotemplate-theme";
const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return darkMedia.matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.dispatchEvent(new CustomEvent("theme-change", { detail: theme }));
}

// Apply immediately on load (this script runs synchronously in <head>).
const initialTheme = getInitialTheme();
applyTheme(initialTheme);

// Respond to system preference changes when no explicit choice is stored.
darkMedia.addEventListener("change", () => {
  if (!localStorage.getItem(STORAGE_KEY)) {
    applyTheme(darkMedia.matches ? "dark" : "light");
  }
});

// Toggle from the theme button.
window.addEventListener("request-theme-change", ((e: CustomEvent<Theme>) => {
  localStorage.setItem(STORAGE_KEY, e.detail);
  applyTheme(e.detail);
}) as EventListener);
