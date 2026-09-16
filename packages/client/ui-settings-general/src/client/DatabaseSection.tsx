import { useEffect, useState } from 'react'
import type { CognateAssetGroup, CognateDatabaseStatus } from '@akashx/akx-api-cognate-controller/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@akashx/akx-client-ui-slots'
import type { SettingsKey } from './locales.ts'
import css from './DatabaseSection.module.css'

/** Registration-side Remote face used by the section. */
export interface DatabaseSectionInjected {
  /** Read the connection state and database roster from the Host. */
  status: () => Promise<CognateDatabaseStatus>
  /** Read one database's semantic assets from the Host. */
  assets: (database: string) => Promise<CognateDatabaseStatus>
}

/** Full component props assembled by the Settings slot renderer. */
export type DatabaseSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings'>
  & InjectFace<DatabaseSectionInjected>

type Translate = (key: SettingsKey) => string

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly value: CognateDatabaseStatus }

/** Dictionary keys for each asset group heading. */
const ASSET_KEYS = {
  tables: 'database.semantic.tables',
  ontology: 'database.semantic.ontology',
  rag: 'database.semantic.rag',
  conceptTrees: 'database.semantic.rag',
} satisfies Record<CognateAssetGroup['kind'], SettingsKey>

/** The pill's copy and tone for one connection state. */
function connectionState(value: CognateDatabaseStatus, t: Translate):
{ readonly label: string; readonly tone: 'ok' | 'warn' } {
  if (!value.configured) return { label: t('database.status.unconfigured'), tone: 'warn' }
  if (!value.reachable) return { label: t('database.status.unreachable'), tone: 'warn' }
  return { label: t('database.status.configured'), tone: 'ok' }
}

/**
 * Render the Cognate database settings page.
 *
 * The page reports what the Host answers rather than what a deployment is
 * assumed to have: an unreachable or unconfigured connection shows its
 * actionable reason, and the asset panels list the names the server returns.
 * @param props - composed slot props (the Remote face and localized copy).
 * @returns the Database settings section.
 */
export function DatabaseSection({ t, status, assets }: DatabaseSectionProps) {
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [chosen, setChosen] = useState<string | undefined>(undefined)

  useEffect(() => {
    let live = true
    void Promise.resolve()
      .then(async () => (chosen === undefined ? status() : assets(chosen)))
      .then(
        (value) => { if (live) setState({ status: 'ready', value }) },
        (error: unknown) => {
          if (live) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        },
      )
    return () => { live = false }
  }, [status, assets, chosen])

  if (state.status === 'loading') {
    return <div className={css.page}><p className={css.note}>{t('database.loading')}</p></div>
  }
  if (state.status === 'error') {
    return <div className={css.page}><p className={css.note}>{state.message}</p></div>
  }

  const value = state.value
  const pill = connectionState(value, t)
  const databases = value.databases
  const selected = value.database ?? databases[0]?.name

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h2 className={css.title}>{t('database.title')}</h2>
          <p className={css.subtitle}>{t('database.subtitle')}</p>
        </div>
        <span className={css.badge}>{t('database.readOnly')}</span>
      </header>

      <section className={css.card}>
        <div className={css.cardHeader}>
          <div>
            <h3 className={css.cardTitle}>{t('database.connection.title')}</h3>
            <p className={css.cardCopy}>{t('database.connection.copy')}</p>
          </div>
          <span className={css.status} data-tone={pill.tone}>{pill.label}</span>
        </div>
        <dl className={css.details}>
          <div>
            <dt>{t('database.endpoint')}</dt>
            <dd>{value.endpoint ?? t('database.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('database.database')}</dt>
            <dd>{selected ?? t('database.notAvailable')}</dd>
          </div>
          <div>
            <dt>{t('database.user')}</dt>
            <dd>{value.user ?? t('database.notAvailable')}</dd>
          </div>
        </dl>
        {value.reason === undefined || !value.configured
          ? null
          : <p className={css.note}>{value.reason}</p>}
        {databases.length === 0
          ? null
          : (
            <div className={css.selector}>
              <label className={css.selectorLabel} htmlFor="cognate-database">{t('database.selector.label')}</label>
              <select
                id="cognate-database"
                className={css.select}
                value={selected ?? ''}
                onChange={(event) => { setChosen(event.target.value) }}
              >
                {databases.map(database => (
                  <option key={database.name} value={database.name}>{database.name}</option>
                ))}
              </select>
            </div>
          )}
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('database.semantic.title')}</h3>
        <p className={css.cardCopy}>{t('database.semantic.copy')}</p>
        {!value.reachable
          ? <p className={css.note}>{t('database.notAvailable')}</p>
          : (
            <div className={css.assetGrid}>
              {value.assets.map(group => (
                <div key={group.kind}>
                  <strong>{t(ASSET_KEYS[group.kind])}</strong>
                  <span className={css.count}>{t('database.semantic.count', { count: String(group.members.length) })}</span>
                  <ul className={css.members}>
                    {group.members.length === 0
                      ? <li className={css.empty}>{t('database.empty')}</li>
                      : group.members.slice(0, 12).map(member => <li key={member}>{member}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
      </section>

      <p className={css.note}>{t('database.configurationHint')}</p>
    </div>
  )
}
