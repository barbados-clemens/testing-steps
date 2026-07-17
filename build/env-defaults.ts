// Must be imported before the observer modules: the environment shim reads
// these at module init.
//
// - enable flag: the production observer is opt-in; this step exists to
//   exercise it, so default it on.
// - NX_CLOUD_VERSION: detectNxCloud() gates the .complete marker on it; force
//   it so the artifact is always handed to the workflow metrics uploader.
// - metrics dir: the executor only injects NX_CLOUD_METRICS_DIRECTORY into
//   the start-agent step, not custom steps, so default to the uploader-watched
//   volume path on Nx Agents (k8s.MetricsUploaderTargetDir). Override via env
//   for local runs.
process.env.NX_CLOUD_ENABLE_CONTAINER_METRICS ||= 'true';
process.env.NX_CLOUD_VERSION ||= 'container-observer-poc';
process.env.NX_CLOUD_VERBOSE_LOGGING ||= 'true';
process.env.NX_CLOUD_METRICS_DIRECTORY ||= '/var/upload/metrics';
