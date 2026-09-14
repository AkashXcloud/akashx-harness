/** Settings page for the Cognate semantic model and database connection. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DatabaseSection.module.css'

export type DatabaseSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings'>

/**
 * Explain the Cognate database surface without displaying credentials or
 * pretending that a provider is reachable from the browser.
 * @param props - settings section owner and localized copy.
 * @returns the Database settings page.
 */
export function DatabaseSection({ t }: DatabaseSectionProps) {
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
          <span className={css.status}>{t('database.connection.status')}</span>
        </div>
        <dl className={css.details}>
          <div><dt>{t('database.endpoint')}</dt><dd>{t('database.endpoint.value')}</dd></div>
          <div><dt>{t('database.authentication')}</dt><dd>{t('database.authentication.value')}</dd></div>
        </dl>
      </section>
      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('database.semantic.title')}</h3>
        <p className={css.cardCopy}>{t('database.semantic.copy')}</p>
        <div className={css.assetGrid}>
          <div><strong>{t('database.semantic.tables')}</strong><span>{t('database.notAvailable')}</span></div>
          <div><strong>{t('database.semantic.ontology')}</strong><span>{t('database.notAvailable')}</span></div>
          <div><strong>{t('database.semantic.rag')}</strong><span>{t('database.notAvailable')}</span></div>
        </div>
      </section>
      <p className={css.note}>{t('database.configurationHint')}</p>
    </div>
  )
}
