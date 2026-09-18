/**
 * Bridge copy. Product text is locale-owned, so every string the panel renders
 * resolves through this dictionary rather than appearing in a component.
 *
 * @module @akashx/akx-client-ui-bridge/locales
 */

/** The Bridge dictionary, and the source of its key union. */
export const en = {
  'panel.label': 'Bridge',
  'panel.title': 'AkashX Bridge',
  'panel.subtitle': 'Ask once. Every mode answers. Compare what each one cost.',
  'panel.empty': 'No lanes yet. Add one to begin.',
  'lane.add': 'Add lane',
  'lane.remove': 'Remove lane',
  'lane.spawning': 'Opening…',
  'lane.ready': 'Ready',
  'lane.running': 'Working…',
  'lane.done': 'Answered',
  'lane.failed': 'Failed',
  'lane.focus': 'Steer this lane only',
  'lane.modeChange': 'Change this lane\u2019s mode',
  'lane.modeLocked': 'Mode is fixed once a lane has answered',
  'lane.unfocus': 'Back to all lanes',
  'lane.open': 'Open as conversation',
  'panes.close': 'Close panes',
  'panes.open': 'Open the panes',
  'panes.running': '{count} lanes are open as panes.',
  'composer.placeholder': 'Ask every lane…',
  'composer.placeholderFocused': 'Ask {lane} only…',
  'composer.send': 'Send',
  'judge.gold': 'The correct answer\u2026',
  'judge.keyed': 'Graded against the answer key.',
  'judge.matched': 'Graded against: {question}',
  'judge.unasked': 'Ask the lanes something first.',
  'judge.run': 'Judge',
  'judge.running': 'Judging\u2026',
  'verdict.correct': 'correct',
  'verdict.incorrect': 'incorrect',
  'metric.harness': 'Agent work',
  'metric.harnessHint': 'New tokens this lane\u2019s own model was billed: uncached input + cache writes + output. Tokens re-read from cache cost nothing new and are excluded.',
  'metric.database': 'Database work',
  'metric.databaseHint': 'Tokens the DEPLOYMENT\u2019s models spent answering this lane\u2019s retrieval. Billed separately from the agent\u2019s own model.',
  'metric.cost': 'Cost',
  'metric.costHint': 'Both pools priced at the deployment\u2019s configured rates: this lane\u2019s own model plus the database models its retrieval spent on.',
  'metric.elapsed': 'Elapsed',
  'metric.elapsedHint': 'Model and tool wall time across this lane\u2019s session.',
} as const

/** Key union for the Bridge dictionary. */
export type BridgeKey = keyof typeof en
