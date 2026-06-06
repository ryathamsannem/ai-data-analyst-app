/** True when all client-side PDF preflight checks passed and quota may be reserved. */
export function shouldReservePdfExportQuota(preflight: {
  contractCheckOk: boolean;
  buildInputOk: boolean;
}): boolean {
  return preflight.contractCheckOk && preflight.buildInputOk;
}
