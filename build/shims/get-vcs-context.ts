// Shim for client-bundle utilities/get-vcs-context — same check as the real
// detectNxCloud (get-vcs-context.ts:503).
export function detectNxCloud(env: Record<string, string | undefined>): boolean {
  return env.NX_CLOUD_VERSION != null && env.NX_CLOUD_VERSION !== '';
}
