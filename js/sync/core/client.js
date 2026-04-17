import { mustGetProvider } from './registry.js';

export class SyncClient {
  constructor(registry, cursorManager, transport) {
    this.registry = registry;
    this.cursorManager = cursorManager; // may be null until infra implemented
    this.transport = transport; // must implement INetworkTransport
  }

  async pull(peerId, entityType) {
    if (!this.transport) throw new Error('No transport configured for SyncClient.pull');
    const provider = mustGetProvider(entityType);

    const lastCursor = this.cursorManager ? await this.cursorManager.getPullCursor(peerId, entityType) : null;

    const res = await this.transport.pull(peerId, entityType, lastCursor);
    if (!res || !res.success) {
      return res;
    }

    const logs = res.data?.logs || [];
    for (const dto of logs) {
      try {
        if (dto.operation === 'DELETE') {
          await provider.delete(dto.entityId, { source: 'remote', peerId });
        } else {
          // dto.payload expected to be full snapshot
          await provider.upsert(dto.payload, { source: 'remote', peerId });
        }
      } catch (e) {
        // apply should be best-effort per-item; continue
        console.error('[SyncClient.pull] failed applying log', dto, e);
      }
    }

    const latestCursor = res.data?.latestCursor ?? lastCursor;
    if (this.cursorManager && latestCursor != null) {
      await this.cursorManager.savePullCursor(peerId, entityType, latestCursor);
    }

    return res;
  }

  async push(peerId, entityType) {
    if (!this.transport) throw new Error('No transport configured for SyncClient.push');
    const provider = mustGetProvider(entityType);
    if (!this.cursorManager) throw new Error('No cursorManager configured for SyncClient.push');

    const lastPushCursor = await this.cursorManager.getPushCursor(peerId, entityType);
    const logs = await provider.getChangedLogs(lastPushCursor);

    if (!logs || logs.length === 0) return { success: true, ackCursor: lastPushCursor };

    // send logs (assume logs are already SyncLogDTO shaped)
    const res = await this.transport.push(peerId, entityType, logs);
    if (res && res.success && res.ackCursor != null) {
      await this.cursorManager.savePushCursor(peerId, entityType, res.ackCursor);
    }

    return res;
  }

  // convenience wrapper: pull then push
  async syncWithPeer(peerId, entityType) {
    await this.pull(peerId, entityType);
    await this.push(peerId, entityType);
  }
}

export default SyncClient;
