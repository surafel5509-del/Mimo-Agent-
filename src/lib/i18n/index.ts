import { en, type Dictionary } from './en';

export type Locale = 'en';
const dictionaries: Record<Locale, Dictionary> = { en };

export function getDictionary(locale: string | undefined): Dictionary {
  return dictionaries[(locale as Locale) ?? 'en'] ?? en;
}

export const SUPPORTED_LOCALES: { code: Locale; name: string; available: boolean }[] = [
  { code: 'en', name: 'English', available: true },
];
