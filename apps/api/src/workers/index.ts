// BullMQ workers run in the same process as the api. Extract to
// apps/jobs once worker load makes co-location risky.
//
// For now this is a placeholder so the call site exists and tests
// can stub it out.

export function startWorkers(): void {
  if (process.env.DISABLE_WORKERS === '1') return;
  // Real workers register here:
  // - matchmaking pairing
  // - season rollover / ranked decay
  // - tournament round-tick
  // - Stripe webhook reconciliation
  // - replay archival
}
