/**
 * Provisioner worker skeleton. Real job steps arrive in P1.4; the P0.11 spike lives in tools/spikes.
 */
export const PROVISIONER_STEPS = [
  "create-db",
  "create-filestore",
  "init-modules",
  "start-instance",
  "bootstrap-admin",
  "register",
] as const;

export type ProvisionerStep = (typeof PROVISIONER_STEPS)[number];
