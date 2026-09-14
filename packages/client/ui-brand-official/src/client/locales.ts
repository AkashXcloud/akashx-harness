/** AkashX brand dictionary. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = { name: 'AkashX' } as const

/** The brand namespace key union. */
export type BrandKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<BrandKey, string> = { name: 'AkashX' }
