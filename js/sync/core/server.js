import { mustGetProvider } from './registry.js';

export class SyncServer {
  constructor(registry) {
    this.registry = registry;
  }

  // return { success: true, data: { logs: [...], latestCursor } }
  async handlePull(entityType, lastCursor) {
    const provider = mustGetProvider(entityType);
    // provider.getChangedLogs should honor lastCursor semantics
    const logs = await provider.getChangedLogs(lastCursor || null);
    // compute latest cursor as max logTimestamp
    let latest = lastCursor ?? null;
    for (const l of logs) {
      const ts = l.logTimestamp ?? l.timestamp ?? null;
      if (ts != null) latest = latest == null ? ts : (ts > latest ? ts : latest);
    }
    return { success: true, data: { logs, latestCursor: latest } };
  }

  // items: array of SyncLogDTO
  async handlePush(entityType, items) {
    const provider = mustGetProvider(entityType);
    try {
      for (const dto of items) {
        if (dto.operation === 'DELETE') {
          await provider.delete(dto.entityId, { source: 'remote' });
        } else {
          await provider.upsert(dto.payload, { source: 'remote' });
        }
      }

      // ack cursor: max timestamp in items
      let ack = null;
      for (const it of items) {
        const ts = it.logTimestamp ?? it.timestamp ?? null;
        if (ts != null) ack = ack == null ? ts : (ts > ack ? ts : ack);
      }
      return { success: true, ackCursor: ack };
    } catch (e) {
      return { success: false, reason: e.message };
    }
  }
}

export default SyncServer;
