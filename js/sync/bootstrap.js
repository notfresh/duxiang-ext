// Minimal bootstrap skeleton for sync runtime
let _runtime = null;

export async function createSyncRuntime(options = {}) {
  if (_runtime) return _runtime;
  // Lazy bootstrap: real wiring happens when core/infra are implemented
  _runtime = { options };
  return _runtime;
}

export function initSyncRuntime() {
  if (!_runtime) throw new Error('createSyncRuntime() must be called first');
  // idempotent init placeholder
}

export function getSyncEngine() {
  if (!_runtime) throw new Error('Sync runtime not initialized');
  return _runtime.engine ?? null;
}

export function setPeers(peerIds) {
  if (!_runtime) throw new Error('Sync runtime not initialized');
  _runtime.peers = Array.from(peerIds || []);
}
