export class SyncEngineOptions {
  constructor({ clientEnabled = true, serverEnabled = false } = {}) {
    this.clientEnabled = clientEnabled;
    this.serverEnabled = serverEnabled;
  }
}

export class SyncEngine {
  constructor(options, client = null, server = null) {
    this.options = options || new SyncEngineOptions();
    this.client = client;
    this.server = server;
    this.knownPeers = [];
  }

  isClientEnabled() { return !!this.options.clientEnabled; }
  isServerEnabled() { return !!this.options.serverEnabled; }

  registerPeer(peerId) {
    if (!this.knownPeers.includes(peerId)) this.knownPeers.push(peerId);
  }
  unregisterPeer(peerId) { this.knownPeers = this.knownPeers.filter(p => p !== peerId); }
  getKnownPeers() { return [...this.knownPeers]; }

  // server-side handlers
  onPullRequest(entityType, cursor) {
    if (!this.isServerEnabled() || !this.server) throw new Error('Server disabled');
    return this.server.handlePull(entityType, cursor);
  }

  onPushRequest(entityType, items) {
    if (!this.isServerEnabled() || !this.server) throw new Error('Server disabled');
    return this.server.handlePush(entityType, items);
  }

  // client-side orchestration
  async pull(peerId, entityType) {
    if (!this.isClientEnabled() || !this.client) { console.log('Client disabled or not configured'); return; }
    return await this.client.pull(peerId, entityType);
  }

  async push(peerId, entityType) {
    if (!this.isClientEnabled() || !this.client) { console.log('Client disabled or not configured'); return; }
    return await this.client.push(peerId, entityType);
  }

  async syncWithPeer(peerId, entityType) {
    if (!this.isClientEnabled() || !this.client) { console.log('Client disabled or not configured'); return; }
    return await this.client.syncWithPeer(peerId, entityType);
  }

  async pullAll(entityType) {
    if (!this.isClientEnabled() || !this.client) { console.log('Client disabled or not configured'); return; }
    for (const peerId of this.knownPeers) {
      try { await this.pull(peerId, entityType); } catch (e) { console.error('pullAll error', e); }
    }
  }
}

export default SyncEngine;
