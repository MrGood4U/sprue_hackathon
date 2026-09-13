import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { de } from "./messages/de.js";
import { en } from "./messages/en.js";
import { es } from "./messages/es.js";
import { fr } from "./messages/fr.js";
import { ja } from "./messages/ja.js";
import { ko } from "./messages/ko.js";
import { zhCN } from "./messages/zh-CN.js";

const I18nContext = createContext(null);
const defaultLocale = "en";
const storageKey = "sprue.locale";
const messages = { en, "zh-CN": zhCN, es, fr, de, ko, ja };

function getInitialLocale() {
  try {
    const savedLocale = window.localStorage.getItem(storageKey);
    if (savedLocale && messages[savedLocale]) return savedLocale;
  } catch {
    // A blocked preference read falls back to the product default.
  }

  return defaultLocale;
}

function interpolate(message, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    message,
  );
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  const t = useCallback((key, values = {}) => {
    const message = messages[locale][key] ?? en[key] ?? key;
    return interpolate(message, values);
  }, [locale]);

  const setLocale = useCallback((nextLocale) => {
    const normalizedLocale = messages[nextLocale] ? nextLocale : defaultLocale;
    setLocaleState(normalizedLocale);
    try {
      window.localStorage.setItem(storageKey, normalizedLocale);
    } catch {
      // A blocked preference write should not prevent the language change.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("meta.title");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  }, [locale, t]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
