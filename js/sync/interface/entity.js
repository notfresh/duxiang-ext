// ISyncEntity interface
export class ISyncEntity {
  // return stable id string
  id() { throw new Error('ISyncEntity.id() not implemented'); }

  // return entity-level version (e.g. updatedAt) used for LWW
  getVersion() { throw new Error('ISyncEntity.getVersion() not implemented'); }

  // convert entity to plain payload for sync_log payload
  toSyncPayload() { throw new Error('ISyncEntity.toSyncPayload() not implemented'); }

  // construct entity instance from payload (static helper)
  static fromSyncPayload(payload) { throw new Error('ISyncEntity.fromSyncPayload() not implemented'); }
}
