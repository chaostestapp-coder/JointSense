import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "color-scheme";

function readStoredScheme() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === "light" || val === "dark" ? val : null;
  } catch {
    return null;
  }
}

function getSystemScheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyMetaScheme(stored) {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.content = stored ?? "light dark";
  }
}

export default function ThemeToggle() {
  const [storedScheme, setStoredScheme] = useState(readStoredScheme);
  const [systemScheme, setSystemScheme] = useState(getSystemScheme);

  useEffect(() => {
    applyMetaScheme(storedScheme);
  }, [storedScheme]);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = (event) => {
      setSystemScheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleMediaChange);

    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY) {
        const next =
          event.newValue === "light" || event.newValue === "dark"
            ? event.newValue
            : null;
        setStoredScheme(next);
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      media.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const effectiveScheme = storedScheme ?? systemScheme;
  const isDark = effectiveScheme === "dark";
  const nextLabel = isDark ? "Switch to light theme" : "Switch to dark theme";

  const handleToggle = () => {
    const targetScheme = isDark ? "light" : "dark";
    const nextStored = targetScheme === systemScheme ? null : targetScheme;

    try {
      if (nextStored === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, nextStored);
      }
    } catch {
      // Apply theme in memory even if storage is unavailable
    }

    setStoredScheme(nextStored);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={nextLabel}
      title={nextLabel}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
    >
      {isDark ? (
        <Sun size={14} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon size={14} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
