// Web e2e scenario: permanent Session deletion from the Workspace row menu.
// The destructive path is confirmed through the browser's own dialog and must
// remove three things through the shipped wire: the Session list row, the
// Workspace's membership account, and the durable JSONL artifact. Zero model
// calls: `session.delete` is a Host RPC with no model involvement, and the two
// rows this scenario manages come from a seeded fixture (the seeded-history
// seed reused read-only — no new recording).
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { logPath } from '../../../packages/session/session-persistence-jsonl/src/format.ts'
import {
  acknowledgeReloadConnectionLoss, launchWebScaffold, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const DELETE_ID = 'session-deletion-web-e2e'
const KEEP_ID = 'session-deletion-web-e2e-kept'
const DELETE_TITLE = 'Delete target'
const KEEP_TITLE = 'Keep target'

/** Whether one path exists, without throwing on the expected absence. */
async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false)
}

describe('web e2e: permanent session deletion', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let deleteLogPath: string
  let keepLogPath: string

  /**
   * Return the session row carrying a title. The sidebar renders session rows
   * as flat siblings of the Workspace group (the group is a disclosure header,
   * not their DOM parent), so the row is located by its own title span.
   * @param title - the localized session title bound to the row.
   * @returns the session row locator.
   */
  async function sessionRow(title: string): Promise<Locator> {
    const row = page.getByRole('treeitem').filter({ has: page.getByText(title, { exact: true }) })
    await row.first().waitFor({ timeout: 15_000 })
    return row.first()
  }

  /** Reveal and click a row's actions trigger, re-hovering if an update replaces the row. */
  async function openRowMenu(row: Locator, title: string): Promise<void> {
    const button = row.getByRole('button', { name: `Session actions for ${title}` })
    await expect.poll(async () => {
      await row.hover()
      return await button.isVisible()
    }, { timeout: 10_000 }).toBe(true)
    await button.click()
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const fixture = await readFile(SEED, 'utf8')
    // One deletable seed and one control seed: the control proves deletion is
    // targeted at the requested identity rather than clearing the account.
    await seedSession(scaffold, fixture, DELETE_ID)
    await seedSession(scaffold, fixture, KEEP_ID)
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    await workspace.attachSession(SessionId(DELETE_ID))
    await workspace.attachSession(SessionId(KEEP_ID))

    // Both seeds share one fixture title, so a user-owned rename is what binds
    // each row locator to its identity across restoration.
    await scaffold.ctx.sessionController.rename({ sessionId: SessionId(DELETE_ID), title: DELETE_TITLE })
    await scaffold.ctx.sessionController.rename({ sessionId: SessionId(KEEP_ID), title: KEEP_TITLE })

    const headers = (await scaffold.ctx.sessionPersistence.list()).map(snapshot => snapshot.header)
    const logPathOf = (id: string): string => {
      const header = headers.find(candidate => candidate.id === id)
      if (header === undefined) throw new Error(`seeded Session ${id} is missing from persistence`)
      return logPath(scaffold.persistenceRoot, header.cwd, SessionId(id), 'zstd')
    }
    deleteLogPath = logPathOf(DELETE_ID)
    keepLogPath = logPathOf(KEEP_ID)
    // Both durable artifacts must exist before the gesture, or a passing
    // absence check afterwards would prove nothing.
    expect(await exists(deleteLogPath)).toBe(true)
    expect(await exists(keepLogPath)).toBe(true)

    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('keeps the Session and its log when the confirmation is cancelled', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-delete-cancel'))
    const row = await sessionRow(DELETE_TITLE)
    await openRowMenu(row, DELETE_TITLE)
    await page.getByRole('menuitem', { name: 'Delete session' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete session' })
    await dialog.waitFor({ timeout: 10_000 })
    // The copy must state permanence and name the target.
    const copy = await dialog.textContent()
    expect(copy).toContain(DELETE_TITLE)
    expect(copy).toContain('cannot be undone')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(() => dialog.count(), { timeout: 10_000 }).toBe(0)
    // Nothing committed: the row and its durable log both survive.
    expect(await row.count()).toBe(1)
    expect(await exists(deleteLogPath)).toBe(true)
    expect((await scaffold.ctx.sessionPersistence.list()).map(snapshot => snapshot.header.id))
      .toContain(SessionId(DELETE_ID))
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('permanently deletes the confirmed Session and its durable log across reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-delete'))
    const row = await sessionRow(DELETE_TITLE)
    await openRowMenu(row, DELETE_TITLE)
    await page.getByRole('menuitem', { name: 'Delete session' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete session' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Delete session' }).click()
    await expect.poll(() => dialog.count(), { timeout: 15_000 }).toBe(0)

    // The list row is gone.
    await expect.poll(() => row.count(), { timeout: 15_000 }).toBe(0)
    // Durable: the stored log is removed and the identity leaves persistence.
    await expect.poll(
      () => scaffold.ctx.sessionPersistence.list().then(snapshots => snapshots.map(s => s.header.id)),
      { timeout: 15_000 },
    ).not.toContain(SessionId(DELETE_ID))
    await expect.poll(() => exists(deleteLogPath), { timeout: 15_000 }).toBe(false)
    // The targeted identity is the only one removed: the control session keeps
    // its membership account and its durable log.
    expect(await exists(keepLogPath)).toBe(true)
    const workspace = await scaffold.ctx.workspaceRegistry.resolveByPath(scaffold.workspaceCwd)
    expect(workspace?.sessionIds ?? []).not.toContain(SessionId(DELETE_ID))
    expect(workspace?.sessionIds ?? []).toContain(SessionId(KEEP_ID))

    // Reload: the deletion is rebuilt from the Host, so the row cannot return.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await expect.poll(() => page.getByText('Workspaces', { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    await page.locator('[role="treeitem"][aria-selected="true"]').waitFor({ timeout: 15_000 })
    expect(await page.getByText(DELETE_TITLE, { exact: true }).count()).toBe(0)
    expect(await page.getByText(KEEP_TITLE, { exact: true }).count()).toBeGreaterThanOrEqual(1)
    expect(await exists(deleteLogPath)).toBe(false)
  }, 90_000)

  it('left no console errors or warnings behind', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
