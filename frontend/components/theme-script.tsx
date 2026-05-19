import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Runs before paint to avoid theme flash. Keeps html class in sync with
 * localStorage or system preference when no saved value exists.
 */
export function ThemeScript() {
  const script = `
(function() {
  try {
    var key = ${JSON.stringify(THEME_STORAGE_KEY)};
    var stored = localStorage.getItem(key);
    var root = document.documentElement;
    var dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
