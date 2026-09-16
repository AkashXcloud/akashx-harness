/**
 * Platform-singleton module-table. These are the ONLY entities the shell
 * shares into the frozen module table — fetch bundles resolve their externals
 * against exactly this set through the loader's require. Keys come from the
 * platform constant module ({@link ./platform.ts}, the single source
 * of truth with the tsdown client externals); values stay shell-static
 * imports so every bundle sees the same instance.
 */
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Cordis from '@akashx/cordis'
import * as ClientStore from '@akashx/akx-client-store'
import * as UiSlots from '@akashx/akx-client-ui-slots'
import * as UiPrimitives from '@akashx/akx-client-ui-primitives'
import * as UiDockkit from '@akashx/akx-client-ui-dockkit'
import type { PlatformModule } from './platform.ts'

/**
 * Build the static table handed to the module loader at boot.
 * @returns module specifier → exported entity (one entry per platform word).
 */
export function getStaticModules(): Record<string, unknown> {
  // The satisfies pin is the projection contract: a word added to
  // PLATFORM_MODULES without a static import here (or vice versa) fails to
  // compile instead of drifting into a runtime require miss.
  return {
    'react': React,
    'react/jsx-runtime': ReactJsxRuntime,
    'react-dom': ReactDom,
    'react-dom/client': ReactDomClient,
    '@akashx/cordis': Cordis,
    '@akashx/akx-client-store': ClientStore,
    '@akashx/akx-client-ui-slots': UiSlots,
    '@akashx/akx-client-ui-primitives': UiPrimitives,
    '@akashx/akx-client-ui-dockkit': UiDockkit,
  } satisfies Record<PlatformModule, unknown>
}
