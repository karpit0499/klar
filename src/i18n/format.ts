import type { Locale } from './translations'

function localeTag(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : 'en-GB'
}

export function formatDate(
  value: string | number | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(localeTag(locale), options).format(date)
}

export function formatDateTime(value: string | number | Date, locale: Locale): string {
  return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeTag(locale), options).format(value)
}

export function formatCurrency(
  value: number,
  currency: string,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, locale, {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 0,
    ...options,
  })
}

export function formatList(values: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(localeTag(locale), { style: 'long', type: 'conjunction' })
    .format(values)
}

export function plural(
  value: number,
  locale: Locale,
  forms: { one: string; other: string },
): string {
  return new Intl.PluralRules(localeTag(locale)).select(value) === 'one'
    ? forms.one
    : forms.other
}
