import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ARC_LANGUAGE_OPTIONS,
  translations,
  type ArcLocale,
  type TranslationKey,
  validateTranslationParity,
  validateTranslationPlaceholders,
} from './locales';

export { ARC_LANGUAGE_OPTIONS };
export type ArcLanguagePreference = 'system' | ArcLocale;

const LANGUAGE_STORAGE_KEY = 'arc.app.language';
const SUPPORTED_LOCALES = Object.keys(translations) as ArcLocale[];

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const parityIssues = validateTranslationParity();
  if (parityIssues.length) {
    console.warn('[i18n] Locale key parity mismatch', parityIssues);
  }

  const placeholderIssues = validateTranslationPlaceholders();
  if (placeholderIssues.length) {
    console.warn('[i18n] Locale placeholder mismatch', placeholderIssues);
  }
}

const systemLocale = (): ArcLocale => {
  const raw = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  const base = raw.toLowerCase().split(/[-_]/)[0] as ArcLocale;
  return SUPPORTED_LOCALES.includes(base) ? base : 'en';
};

const interpolate = (
  template: string,
  values?: Record<string, string | number | null | undefined>
) => {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? '' : String(value);
  });
};

/**
 * Hermes builds do not always expose Intl.PluralRules even when
 * Intl.NumberFormat / Intl.DateTimeFormat are available.
 *
 * Use the platform implementation when present, otherwise fall back to the
 * plural rules needed by ARC's current locale set.
 *
 * All current ARC count strings use integer counts:
 * - en/da/de/es/it: singular only for 1
 * - fr: singular form for 0 and 1
 * - ja: no singular/plural distinction
 */
const selectPluralCategory = (locale: ArcLocale, count: number): string => {
  const pluralRulesCtor = (
    Intl as unknown as {
      PluralRules?: new (
        locale?: string | string[]
      ) => { select(value: number): string };
    }
  ).PluralRules;

  if (typeof pluralRulesCtor === 'function') {
    try {
      return new pluralRulesCtor(locale).select(count);
    } catch {
      // Fall through to the deterministic ARC locale fallback below.
    }
  }

  if (locale === 'ja') return 'other';
  if (locale === 'fr') return count === 0 || count === 1 ? 'one' : 'other';
  return count === 1 ? 'one' : 'other';
};

export const useArcI18n = () => {
  const [languagePreference, setLanguagePreferenceState] =
    useState<ArcLanguagePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((value) => {
        if (!active || !value) return;
        if (
          value === 'system' ||
          SUPPORTED_LOCALES.includes(value as ArcLocale)
        ) {
          setLanguagePreferenceState(value as ArcLanguagePreference);
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const activeLocale: ArcLocale =
    languagePreference === 'system' ? systemLocale() : languagePreference;

  const setLanguagePreference = useCallback(
    (preference: ArcLanguagePreference) => {
      setLanguagePreferenceState(preference);
      void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
    },
    []
  );

  const t = useCallback(
    (
      key: TranslationKey,
      values?: Record<string, string | number | null | undefined>
    ) => {
      let resolvedKey: TranslationKey = key;

      if (typeof values?.count === 'number') {
        const category = selectPluralCategory(activeLocale, values.count);
        const pluralCandidate = `${key}.${category}` as TranslationKey;
        const otherCandidate = `${key}.other` as TranslationKey;

        if (pluralCandidate in translations.en) {
          resolvedKey = pluralCandidate;
        } else if (otherCandidate in translations.en) {
          resolvedKey = otherCandidate;
        }
      }

      const localeTable = translations[activeLocale] as Record<string, string>;
      const englishTable = translations.en as Record<string, string>;
      const template =
        localeTable[resolvedKey] ??
        englishTable[resolvedKey] ??
        englishTable[key] ??
        key;

      return interpolate(template, values);
    },
    [activeLocale]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(activeLocale, options).format(value),
    [activeLocale]
  );

  const formatDate = useCallback(
    (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(
        activeLocale,
        options ?? { year: 'numeric', month: 'numeric', day: 'numeric' }
      ).format(typeof value === 'number' ? new Date(value) : value),
    [activeLocale]
  );

  const formatDateTime = useCallback(
    (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(
        activeLocale,
        options ?? {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }
      ).format(typeof value === 'number' ? new Date(value) : value),
    [activeLocale]
  );

  const formatTime = useCallback(
    (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(
        activeLocale,
        options ?? { hour: '2-digit', minute: '2-digit' }
      ).format(typeof value === 'number' ? new Date(value) : value),
    [activeLocale]
  );

  return useMemo(
    () => ({
      ready,
      activeLocale,
      languagePreference,
      setLanguagePreference,
      t,
      formatNumber,
      formatDate,
      formatDateTime,
      formatTime,
      languageOptions: ARC_LANGUAGE_OPTIONS,
    }),
    [
      ready,
      activeLocale,
      languagePreference,
      setLanguagePreference,
      t,
      formatNumber,
      formatDate,
      formatDateTime,
      formatTime,
    ]
  );
};
