// @vitest-environment jsdom
import { Context } from '@akashx/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@akashx/akx-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { AkashxMark, AkashxName } from '../src/client/Brand.tsx'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
] as const

const HERO_HOLE = 'conversation.hero.brand.mark'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries([...HOLES, HERO_HOLE].map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

describe('official browser-brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the slot service it uses', () => {
    expect(inject).toEqual(['slots'])
  })

  it('brands every slot without requiring a build profile', async () => {
    vi.stubEnv('AKX_CLIENT_BUILD_PROFILE', 'local')
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
  })

  it('fills declarations before or after apply and removes every occupant on teardown', async () => {
    vi.stubEnv('AKX_CLIENT_BUILD_PROFILE', 'official')
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    before.disposeHoles?.()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)

    const after = await bench(false)
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
  })

  it('replaces the conversation hero fallback with the AkashX mark', async () => {
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    expect(subject.slots.entries(HERO_HOLE)).toHaveLength(1)
  })

  it('renders the AkashX name independently from both requested mark sizes', () => {
    const name = render(<AkashxName t={(key: string) => key === 'name' ? 'AkashX' : key} />)
    expect(name.container.textContent).toBe('AkashX')
    name.unmount()

    const mark = render(<AkashxMark size={34} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('34')
    mark.rerender(<AkashxMark size={24} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
  })
})
