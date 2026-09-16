/** Locale-owned code renderer name and CodeBlock controls. */
import type {} from '@akashx/akx-client-ui-slots'

declare module '@akashx/akx-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Code document implementation name and copy controls. */
    sidebarCodePreview: keyof typeof en
  }
}

/** English dictionary with the same keys. */
export const en = {
  title: 'Code',
  copy: 'Copy',
  copied: 'Copied',
}
