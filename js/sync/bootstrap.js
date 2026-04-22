// Minimal bootstrap skeleton for sync runtime
import { initSyncDB } from './infra/sync-db.js';
import * as cursorManager from './infra/cursor-manager.js';
import * as syncLogRepo from './infra/sync-log-repo.js';
import { register, getRegisteredEntityTypes } from './core/registry.js';
import SyncClient from './core/client.js';
import SyncServer from './core/server.js';
import SyncEngine, { SyncEngineOptions } from './core/engine.js';
import HttpTransport from './infra/http-transport.js';
import { LinkSyncProvider } from './entities/link-provider.js';

let _runtime = null;

export async function createSyncRuntime(options = {}) {
  if (_runtime) return _runtime;
  // ensure DB stores exist
  await initSyncDB();

  // wire infra pieces
  const cm = cursorManager;
  const repo = syncLogRepo;

  // register providers
  register('LINK', new LinkSyncProvider());

  // client/server created with registry-aware modules
  const client = new SyncClient({ register, getRegisteredEntityTypes }, cm, null);
  const server = new SyncServer({ register, getRegisteredEntityTypes });

  // transport: allow caller to provide baseUrlForPeer via options
  const transport = new HttpTransport({ baseUrlForPeer: options.baseUrlForPeer || ((p) => p) });
  // wire transport into client
  client.transport = transport;

  const engine = new SyncEngine(new SyncEngineOptions(options), client, server);

  _runtime = {
    options,
    cursorManager: cm,
    syncLogRepo: repo,
    client,
    transport,
    server,
    engine,
    peers: []
  };

  return _runtime;
}

export function initSyncRuntime() {
  if (!_runtime) throw new Error('createSyncRuntime() must be called first');
  // idempotent init - placeholder for future background hooks
}

export function getSyncEngine() {
  if (!_runtime) throw new Error('Sync runtime not initialized');
  return _runtime.engine ?? null;
}

export function setPeers(peerIds) {
  if (!_runtime) throw new Error('Sync runtime not initialized');
  _runtime.peers = Array.from(peerIds || []);
}

export function getRuntime() { return _runtime; }
