import { useId } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Native viewBox of {@link AKASHX_MARK_PATH}, cropped to the mark's own bounds. */
export const AKASHX_MARK_VIEWBOX = { x: 134.911, y: 0.348877, width: 41.089, height: 40.318 }

/**
 * The AkashX mark: the gradient glyph from the site header logo, which carries
 * the `#30D5C8` turquoise to `#7557FF` purple brand gradient.
 */
export const AKASHX_MARK_PATH =
  'M175.854 40.3297L165.154 19.4026L162.471 20.6852L170.47 36.3299C170.74 36.7349 170.133 36.6505 170.133 36.6505C160.867 36.5493 157.121 27.0815 157.121 27.0815L161.509 18.6263L169.188 15.3691L162.099 13.3101L155.416 0.348877L148.716 13.3777L141.662 15.3691L149.526 18.7275L153.745 27.1828C148.682 37.41 140.75 36.7012 140.75 36.7012C140.194 36.7349 140.396 36.4312 140.396 36.4312L148.362 20.6852L145.78 19.3689L134.911 40.6503H142.134C151.062 40.6503 155.214 30.7606 155.214 30.7606C155.399 30.2712 155.585 30.8281 155.585 30.8281C160.429 40.6841 167.483 40.6503 167.483 40.6503H175.584C176.124 40.6672 175.854 40.3297 175.854 40.3297ZM155.467 23.7905L151.163 15.4028L155.433 7.01515L159.77 15.4028L155.467 23.7905Z'

/** Presentation accepted by every surface that renders the brand mark. */
export interface AkashxMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class preserving the surrounding mark geometry. */
  className?: string | undefined
}

/**
 * Render the AkashX mark at a host-requested square edge. Each instance mints
 * its own gradient id so several marks on one page never share a reference.
 * @param props - host-supplied mark presentation.
 * @returns the AkashX brand mark.
 */
export function AkashxMark({ size, className }: AkashxMarkProps) {
  const gradientId = `akashx-mark-${useId()}`
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`${AKASHX_MARK_VIEWBOX.x} ${AKASHX_MARK_VIEWBOX.y} ${AKASHX_MARK_VIEWBOX.width} ${AKASHX_MARK_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="155.817" y1="0.348877" x2="155.315" y2="27.9936" gradientUnits="userSpaceOnUse">
          <stop stopColor="#30D5C8" />
          <stop offset="1" stopColor="#7557FF" />
        </linearGradient>
      </defs>
      <path d={AKASHX_MARK_PATH} fill={`url(#${gradientId})`} />
    </svg>
  )
}

/**
 * Render the AkashX wordmark without the independently slotted mark.
 * @param props - localized dictionary access.
 * @returns the AkashX name.
 */
export function AkashxName({ t }: PropsLocale<'brand'>) {
  return <span style={{ color: 'var(--dsw-alias-brand-primary)', fontWeight: 700 }}>{t('name')}</span>
}
