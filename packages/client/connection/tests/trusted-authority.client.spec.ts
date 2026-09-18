/**
 * A page reading its own authority against the deployment's declaration.
 *
 * The Host fence answers this per request; the page answers it once about
 * itself, to know whether to attempt privileged surfaces at all. The two read
 * the same declaration, so a page must never call itself privileged where the
 * fence would refuse it.
 */

import { describe, expect, it } from 'vitest'
import { isDeclaredTrustedAuthority } from '../src/trusted-authority.ts'

describe('isDeclaredTrustedAuthority', () => {
  it('declares nothing privileged when the deployment declared nothing', () => {
    expect(isDeclaredTrustedAuthority('172.212.228.34', [])).toBe(false)
  })

  it('matches a declared host on any port when the entry names no port', () => {
    expect(isDeclaredTrustedAuthority('172.212.228.34', ['172.212.228.34'])).toBe(true)
    expect(isDeclaredTrustedAuthority('172.212.228.34:8443', ['172.212.228.34'])).toBe(true)
  })

  it('holds a declared port to that exact authority', () => {
    expect(isDeclaredTrustedAuthority('harness.internal:3080', ['harness.internal:3080'])).toBe(true)
    expect(isDeclaredTrustedAuthority('harness.internal:9999', ['harness.internal:3080'])).toBe(false)
  })

  it('refuses a different host that merely looks similar', () => {
    expect(isDeclaredTrustedAuthority('172.212.228.35', ['172.212.228.34'])).toBe(false)
    expect(isDeclaredTrustedAuthority('evil.example', ['harness.internal'])).toBe(false)
  })

  it('refuses an authority it cannot parse rather than guessing', () => {
    expect(isDeclaredTrustedAuthority('', ['harness.internal'])).toBe(false)
    expect(isDeclaredTrustedAuthority('http://harness.internal', ['harness.internal'])).toBe(false)
  })

  it('compares through the same normalization the fence uses', () => {
    // Case and a redundant default port never decide trust, on either side.
    expect(isDeclaredTrustedAuthority('HARNESS.internal', ['harness.internal'])).toBe(true)
  })
})
