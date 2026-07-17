// Shim for client-bundle utilities/environment — only the two values the
// container observer reads, resolved from env at startup.
export const NX_CLOUD_DISABLE_METRICS_COLLECTION =
  process.env.NX_CLOUD_DISABLE_METRICS_COLLECTION === 'true';

export const VERBOSE_LOGGING =
  process.env.NX_VERBOSE_LOGGING === 'true' ||
  process.env.NX_CLOUD_VERBOSE_LOGGING === 'true';
