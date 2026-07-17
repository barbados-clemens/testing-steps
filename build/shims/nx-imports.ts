// Shim for client-bundle utilities/nx-imports. Never reached: env-defaults
// always sets NX_CLOUD_METRICS_DIRECTORY, so defaultWriteDirectory() returns
// before requiring this module.
export const cacheDirectory = '/tmp/nx-cache';
