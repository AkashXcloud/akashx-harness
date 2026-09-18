/** The benchmark answer key stored in the Host user-settings document. */

import z from '@akashx/schemastery'

/** Settings namespace owned by the Bridge plugin. */
export const BRIDGE_SETTINGS_NAMESPACE = 'ui-bridge'

/** One benchmark question and the answer a grade is measured against. */
export interface BenchAnswer {
  /**
   * The benchmark's own id for the question, which the grader answers with so a
   * grade says which row it was measured against. Defaults to the row's
   * position when the suite has no ids of its own.
   */
  id?: string
  /** The question as the benchmark states it; the grader matches what was asked against this. */
  question: string
  /** The known-good answer. */
  gold: string
}

/** Durable Bridge section shared by the Host schema and the browser scope. */
export interface BridgeSettings {
  /**
   * The benchmark's questions and their answers. The grader reads the whole key
   * and picks the row that asks what the lanes were asked; a typed answer
   * replaces the key for that one grade.
   */
  answerKey: BenchAnswer[]
}

/** Durable Bridge schema; also the wire envelope the browser scope validates against. */
export const BridgeSettingsSchema = z.object({
  answerKey: z.array(z.object({
    id: z.string(),
    question: z.string(),
    gold: z.string(),
  })).default([]),
}) as unknown as z<BridgeSettings>
