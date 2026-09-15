/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** The settings namespace key union. */
export type SettingsKey = keyof typeof en

/** Locale keys this namespace declares. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'connection.error': 'Disconnected',
  'connection.retry': 'Reconnect now',
  'connection.connecting': 'Reconnecting',
  'connection.connected': 'Connected',
  'connection.reconnect': 'Disconnected, reconnect now',
  'connection.restart': 'Reconnecting automatically, reconnect now',
  'database.nav': 'Database',
  'database.title': 'Semantic model and database',
  'database.subtitle': 'View the Cognate data source and semantic asset status.',
  'database.readOnly': 'Status view',
  'database.connection.title': 'Database connection',
  'database.connection.copy': 'The Cognate Host configuration manages the connection; credentials never appear in the browser.',
  'database.connection.status': 'Not configured',
  'database.endpoint': 'Endpoint',
  'database.endpoint.value': 'Set AKASHXDB_URL in the Host configuration',
  'database.authentication': 'Authentication',
  'database.authentication.value': 'Managed by the Host',
  'database.semantic.title': 'Semantic assets',
  'database.semantic.copy': 'After connection, this page will show tables, ontology views, and RagBuckets from the semantic model.',
  'database.semantic.tables': 'Tables and views',
  'database.semantic.ontology': 'Ontology views',
  'database.semantic.rag': 'RagBuckets',
  'database.notAvailable': 'Not available',
  'database.configurationHint': 'To enable database queries, select a Cognate provider and set AKASHXDB_URL in the startup configuration.',
}
