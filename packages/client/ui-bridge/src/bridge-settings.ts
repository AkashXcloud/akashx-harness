/** The benchmark answer key stored in the Host user-settings document. */

import z from '@akashx/schemastery'

/** Settings namespace owned by the Bridge plugin. */
export const BRIDGE_SETTINGS_NAMESPACE = 'ui-bridge'

/** One benchmark question and the answer a grade is measured against. */
export interface BenchAnswer {
  /** The question as the benchmark states it; matched against what the lanes were asked. */
  question: string
  /** The known-good answer. */
  gold: string
}

/** Durable Bridge section shared by the Host schema and the browser scope. */
export interface BridgeSettings {
  /**
   * The benchmark's questions and their answers. A question absent from the key
   * is graded against a typed answer instead; the key never invents one.
   */
  answerKey: BenchAnswer[]
}

/** Durable Bridge schema; also the wire envelope the browser scope validates against. */
export const BridgeSettingsSchema = z.object({
  answerKey: z.array(z.object({
    question: z.string(),
    gold: z.string(),
  })).default([]),
}) as unknown as z<BridgeSettings>
