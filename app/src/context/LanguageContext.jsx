import { useState } from "react";
import { LanguageContext } from "./useLanguage";

const STORAGE_KEY = "jointsense-language";

function readStoredLanguage() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === "hi" || val === "en" ? val : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLanguage);

  const setLang = (nextLang) => {
    const normalized = nextLang === "hi" ? "hi" : "en";
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // Ignore storage failures
    }
    setLangState(normalized);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}
