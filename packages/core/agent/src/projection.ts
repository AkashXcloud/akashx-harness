import type { TurnBoundaryProjection } from './types.ts'
import type {} from '@akashx/akx-session-projection'

declare module '@akashx/akx-session-projection/types' {
  interface SessionProjectionStateMap {
    /** The agent session's open/last turn and step boundary facts (whole value). */
    turnBoundary: TurnBoundaryProjection
  }
}

export {}
