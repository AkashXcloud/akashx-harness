/** Root-scoped main occupant: the current Session's conversation, or several side by side. */
import { ScopeIdentityProvider } from '@akashx/akx-client-ui-renderer/client'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@akashx/akx-client-ui-slots'
import type { ObservableSnapshot } from '@akashx/akx-client-store'
import type { PaneState } from '../panes.ts'
import type {} from '../contract/slots.ts'
import css from './ConversationPanel.module.css'

/** Everything the panel needs that is not a slot child. */
export interface ConversationPanelInjected {
  /** Private reactive sources bound to framework selector hooks. */
  hooks: { panes: ObservableSnapshot<PaneState> }
}

/** Props the conversation main panel renders from. */
export type ConversationPanelProps =
  PropsRuntime<'main'>
  & InjectFace<ConversationPanelInjected>
  & PropsRenderSlots<'main.conversation' | 'conversation.panes.bar' | 'conversation.pane.chrome'>

/**
 * Render the Conversation with optional current-Session binding, or one pane
 * per Session while a comparison is running.
 *
 * A pane is the same `main.conversation` subtree bound to another Session's
 * scope, so every pane streams what the single view streams. The feature that
 * set the panes fills the bar above them and the chrome inside each one.
 *
 * @param props - main-slot inputs, the pane feed, and the declared renderers.
 * @returns the Conversation subtree, or the pane grid.
 */
export function ConversationPanel({ usePanes, renderSlot }: ConversationPanelProps) {
  const panes = usePanes(state => state.panes)
  if (panes === undefined) return renderSlot('main.conversation', {})
  return (
    <div className={css.paneMode} data-conversation-panes>
      {renderSlot('conversation.panes.bar', {})}
      <div className={css.panes} style={{ '--akx-pane-count': Math.max(panes.length, 1) } as React.CSSProperties}>
        {panes.map((sessionId, at) => (
          <ScopeIdentityProvider
            // Two panes on one Session are legal and each keeps its own seat.
            key={`${sessionId}:${at}`}
            scope="session-maybe"
            identity={sessionId}
          >
            <section className={css.pane} data-conversation-pane={sessionId}>
              {renderSlot('conversation.pane.chrome', {})}
              <div className={css.paneBody}>{renderSlot('main.conversation', {})}</div>
            </section>
          </ScopeIdentityProvider>
        ))}
      </div>
    </div>
  )
}
