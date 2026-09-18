/**
 * Matching one authority against the `trustedHosts` a deployment declared.
 *
 * Both faces read this: the Host applies it to every request's `Host` header,
 * and the served page applies it to its own authority to learn whether the
 * deployment means it to reach privileged surfaces. One implementation, so the
 * two can never disagree about what the operator declared.
 *
 * @module @akashx/akx-client-connection/trusted-authority
 */

import { isLoopbackHostname } from './loopback-hostname.ts'

/** Normalized URL of a Host-header authority (hostname lowercased, default port stripped, IPv6 bracketed), or undefined when unparsable. */
export function parseAuthority(authority: string): URL | undefined {
  try {
    // http: is a WHATWG "special scheme": parsing yields a non-empty hostname or throws.
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/**
 * Assert one configured `trustedHosts` entry is a bare authority (`host` or
 * `host:port`) in canonical form: it must survive WHATWG parsing unchanged
 * (case aside). Anything parsing would silently rewrite is refused as a typo
 * that must fail the load loudly instead of being ignored until requests 403
 * or quietly changing the grant: URL parts beyond the authority
 * (`harness.internal/path`, `user@harness.internal` — which would authorize
 * the embedded hostname), stripped whitespace, a dangling colon or
 * zero-padded port (which would broaden an intended exact-port grant to every
 * port), and non-canonical host spellings (`0x7f.0.0.1`, percent-encoding,
 * unbracketed IPv6; IDN hosts are declared in punycode, the form the wire
 * carries).
 * @param entry - the configured value, verbatim.
 */
export function assertTrustedAuthority(entry: string): void {
  const entryUrl = parseAuthority(entry)
  if (entryUrl !== undefined && canonicalAuthority(entry, entryUrl) === entry.toLowerCase()) return
  throw new Error(`client-connection: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`)
}

/**
 * Canonical form of a parsed authority: `hostname` when no port was written,
 * else `hostname:port`. The port is judged from URL parses under both special
 * schemes (their default ports differ, so `:80` and `:443` still count as
 * explicit), never from the raw string, where WHATWG trimming would misread
 * shapes like `host:port ` as port-less.
 */
export function canonicalAuthority(entry: string, entryUrl: URL): string {
  // An authority that parsed under http cannot fail under https.
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/**
 * Whether the request authority matches a `trustedHosts` entry. An entry with
 * an explicit port matches that exact authority; a port-less entry matches the
 * hostname on any port (the shape the CLI derives for IP-literal LAN serving,
 * where the bound port may be OS-assigned). Both sides compare through WHATWG
 * normalization, so case and a redundant `:80` never decide trust.
 */
export function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/**
 * Whether a page's own authority is one the operator explicitly declared in
 * `trustedHosts`.
 *
 * The served page asks this about itself, to learn whether the deployment
 * intends this authority to reach privileged surfaces -- the same question the
 * request fence answers per request, asked once about the page. A deployment
 * that declared nothing keeps loopback as its only privileged authority.
 *
 * @param authority - the page's `host` (hostname, or `hostname:port`).
 * @param trustedHosts - the authorities this deployment declared.
 * @returns true when the operator named this authority.
 */
export function isDeclaredTrustedAuthority(
  authority: string,
  trustedHosts: readonly string[],
): boolean {
  const hostUrl = parseAuthority(authority)
  return hostUrl === undefined ? false : isTrustedAuthority(hostUrl, trustedHosts)
}


/**
 * Whether an authority is loopback or one the operator explicitly declared.
 * @param hostUrl - the parsed authority.
 * @param trustedHosts - the authorities this deployment declared.
 * @returns true when the authority is ours.
 */
export function isOurAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return isLoopbackHostname(hostUrl.hostname) || isTrustedAuthority(hostUrl, trustedHosts)
}
