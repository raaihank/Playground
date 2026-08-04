// Theme preference handling shared by the no-FOUC inline script and the
// ThemeToggle. Three choices: "system" (follow the OS), "light", "dark".
export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/**
 * Runs in the browser *before* React hydrates (injected as an inline <script>
 * in the root layout) so the correct `.dark` class is on <html> on first paint.
 * Kept self-contained — it is stringified, so it must not reference anything
 * outside its own body except globals like window/document.
 */
export function themeInitScript(storageKey: string): string {
  return `(function(){try{var t=localStorage.getItem(${JSON.stringify(storageKey)});var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
}
