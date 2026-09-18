/** The Bridge entry in the sidebar's global panel rail. */
import { IconBranchOutline16 } from '@akashx/akx-client-ui-primitives'
import type { SidebarPanelIconOwnerProps } from '@akashx/akx-client-ui-sidebar/client'

/**
 * Render the rail icon for the Bridge panel.
 *
 * The sidebar owns the button, its label and its selected state; this supplies
 * only the mark, sized to the rail's current width.
 * @param props - the rail's requested edge and selection state.
 * @returns the branch mark at the requested size.
 */
export function BridgeIcon({ size }: SidebarPanelIconOwnerProps) {
  return <IconBranchOutline16 size={size} />
}
