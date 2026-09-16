/**
 * Virtual root of the worker host's in-memory filesystem. Kept
 * in one module so the process shim, the path/os shims, and the VFS image
 * collector cannot drift apart.
 */

/** Virtual filesystem root; `process.cwd()` and every absolute path start here. */
export const AKX_ROOT = '/akx'

/** `$AKX_HOME`: durable-state directory inside the image. */
export const AKX_HOME = `${AKX_ROOT}/home`

/** Flat, symlink-free package tree resolved by the worker module loader. */
export const AKX_NODE_MODULES = `${AKX_ROOT}/node_modules`

/** Directory holding the composed cordis.yml and the agent-preset tree. */
export const AKX_CONFIG = `${AKX_ROOT}/config`

/** Default (empty) workspace directory. */
export const AKX_WORKSPACE = `${AKX_ROOT}/workspace`

/** Temporary directory reported by `os.tmpdir()`. */
export const AKX_TMP = `${AKX_ROOT}/tmp`
