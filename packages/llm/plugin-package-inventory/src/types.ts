/** Wire types for the active AkashX plugin package inventory. */

/** One exact active plugin package version. */
export interface AkashXPluginPackageIdentity {
  readonly name: string
  readonly version: string
}

/** Versioned full package inventory carried by each official AkashX request. */
export interface AkashXPluginPackageInventoryExtension {
  readonly version: 1
  readonly packages: readonly AkashXPluginPackageIdentity[]
}

declare module '@akashx/akx-llm-api-extensions/types' {
  interface AkashXLlmApiExtensionMap {
    akx_plugin_packages: AkashXPluginPackageInventoryExtension
  }
}
