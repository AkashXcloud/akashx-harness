/** Typed preload operations exposed only by the Electron shell. */

import type { DesktopPluginRecord } from './project-manager.ts'
import type { DesktopLocale } from './locale.ts'
import type { DesktopBackendState } from './backend-controller.ts'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  localeGet: 'akx-desktop:locale-get',
  pluginsList: 'akx-desktop:plugins-list',
  pluginsAdd: 'akx-desktop:plugins-add',
  pluginsRemove: 'akx-desktop:plugins-remove',
  pluginsUpdate: 'akx-desktop:plugins-update',
  pluginsToggle: 'akx-desktop:plugins-toggle',
  pluginsDisableAll: 'akx-desktop:plugins-disable-all',
  backendStatus: 'akx-desktop:backend-status',
  backendRetry: 'akx-desktop:backend-retry',
  applicationRestart: 'akx-desktop:application-restart',
  configurationReset: 'akx-desktop:configuration-reset',
  backendState: 'akx-desktop:backend-state',
  updatesCheck: 'akx-desktop:updates-check',
  updatesInstall: 'akx-desktop:updates-install',
  updatesState: 'akx-desktop:updates-state',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
}

/** Narrow bridge exposed through context isolation. */
export interface AkxDesktopApi {
  readonly protocolVersion: 1
  locale(): Promise<DesktopLocale>
  readonly plugins: {
    list(): Promise<readonly DesktopPluginRecord[]>
    add(spec: string): Promise<void>
    remove(name: string): Promise<void>
    update(name: string, version: string): Promise<void>
    toggle(name: string, enabled: boolean): Promise<void>
    disableAll(): Promise<void>
  }
  readonly backend: {
    status(): Promise<DesktopBackendState>
    retry(): Promise<void>
    subscribe(listener: (state: DesktopBackendState) => void): () => void
  }
  readonly updates: {
    check(): Promise<DesktopUpdateState>
    install(): Promise<void>
    subscribe(listener: (state: DesktopUpdateState) => void): () => void
  }
}

/** Startup-page controls, unavailable to backend-provided application documents. */
export interface AkxDesktopStartupApi extends Pick<AkxDesktopApi, 'protocolVersion' | 'locale'> {
  readonly backend: Omit<AkxDesktopApi['backend'], 'retry'>
  disablePlugins(): Promise<void>
  restart(): Promise<void>
  resetConfiguration(): Promise<void>
}
