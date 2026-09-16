/**
 * TypeScript client SDK for the AkashX Harness runtime: spawn the
 * same-version `akx --profile sdk` runtime as a subprocess and drive agent
 * turns over stdio JSON-RPC. `AkashXHarness` is the high-level run API;
 * `HarnessClient` is the lower-level protocol client. A pure library — it
 * registers nothing on a Cordis context; named profiles and ordered patch
 * files customize the runtime process it spawns.
 *
 * @module @akashx/akx-sdk-client
 */

export { AkashXHarness, HarnessSession } from './api.ts'
export type { RunOptions } from './api.ts'
export {
  HarnessClient,
  RequestTimeoutError,
  SdkProtocolError,
  TransportClosedError,
} from './client.ts'
export type { NotificationSubscription } from './client.ts'
export { JsonRpcResponseError } from '@akashx/akx-sdk-protocol'
export type {
  ContentBlock,
  SdkPromptContentBlock,
  AkashXHarnessOptions,
  HarnessClientOptions,
  HarnessNotification,
  NotificationFilter,
  RunResult,
} from './types.ts'
