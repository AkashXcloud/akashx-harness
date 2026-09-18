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
  'composer.placeholder': 'Ask every lane…',
  'composer.placeholderFocused': 'Ask {lane} only…',
  'composer.send': 'Send',
  'judge.question': 'The question that was asked\u2026',
  'judge.gold': 'The correct answer\u2026',
  'judge.run': 'Judge',
  'judge.running': 'Judging\u2026',
  'verdict.correct': 'correct',
  'verdict.incorrect': 'incorrect',
  'metric.harness': 'Harness',
  'metric.database': 'Database',
  'metric.elapsed': 'Elapsed',
} as const

/** Key union for the Bridge dictionary. */
export type BridgeKey = keyof typeof en
