// ISyncProvider: provider for a specific entity type
export class ISyncProvider {
  // return string entity type (e.g. 'LINK')
  getEntityType() { throw new Error('ISyncProvider.getEntityType() not implemented'); }

  // return Promise<Array<SyncLogDTO>> of logs with logTimestamp > lastCursor
  async getChangedLogs(lastCursor) { throw new Error('ISyncProvider.getChangedLogs() not implemented'); }

  // return Promise<entity|null>
  async getEntityById(entityId) { throw new Error('ISyncProvider.getEntityById() not implemented'); }

  // upsert entity; context={ source: 'local'|'remote', peerId?: string }
  async upsert(entity, context) { throw new Error('ISyncProvider.upsert() not implemented'); }

  // delete entity; context same as upsert
  async delete(entityId, context) { throw new Error('ISyncProvider.delete() not implemented'); }
}
