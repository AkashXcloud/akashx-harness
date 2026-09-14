import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official whale mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 22 12 12 22 2 12 12 2Z" fill="currentColor" />
      <path d="m12 6 6 6-6 6-2-2 4-4-4-4 2-2Z" fill="var(--dsw-alias-label-primary-foreground)" />
    </svg>
  )
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName({ t }: PropsLocale<'brand'>) {
  return <span style={{ color: 'var(--dsw-alias-brand-primary)', fontWeight: 700 }}>{t('name')}</span>
}
