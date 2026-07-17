// Must be imported before the observer modules: the environment shim reads
// these at module init.
//
// - enable flag: the production observer is opt-in; this step exists to
//   exercise it, so default it on.
// - NX_CLOUD_VERSION: detectNxCloud() gates the .complete marker on it; force
//   it so the artifact is always handed to the workflow metrics uploader.
// - metrics dir: injected as /var/upload/metrics on Nx Agents; the /tmp
//   fallback keeps local runs working without the nx-imports shim.
process.env.NX_CLOUD_ENABLE_CONTAINER_METRICS ||= 'true';
process.env.NX_CLOUD_VERSION ||= 'container-observer-poc';
process.env.NX_CLOUD_VERBOSE_LOGGING ||= 'true';
process.env.NX_CLOUD_METRICS_DIRECTORY ||= '/tmp/metrics';
