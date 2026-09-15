/** Locale-owned image renderer labels and status text. */

/** Image renderer dictionary keys. */
export type ImagePreviewKey = keyof typeof en

/** English dictionary with the same keys as the Chinese dictionary. */
export const en = {
  title: 'Image',
  preview: 'Image preview: {name}',
  loading: 'Opening image…',
  failed: 'This image could not be displayed.',
  unsupported: 'Image preview requires the complete file contents.',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Image preview selection, accessible name, and status text. */
    sidebarImage: ImagePreviewKey
  }
}
