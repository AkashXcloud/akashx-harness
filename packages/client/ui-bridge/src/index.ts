/**
 * AkashX Bridge, node half. The empty apply exists so the plugin appears in the
 * host cordis.yml / Loader; the browser half ships the panel through
 * exports["./client"], discovered from the package.json akx.client declaration.
 */

/** Host plugin body — Bridge is a browser surface over Sessions the Host already serves. */
export function apply(): void {}
