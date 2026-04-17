export const SyncOperation = Object.freeze({ CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' });

export class ISyncLog {
  getLogId() { throw new Error('ISyncLog.getLogId() not implemented'); }
  getEntityType() { throw new Error('ISyncLog.getEntityType() not implemented'); }
  getEntityId() { throw new Error('ISyncLog.getEntityId() not implemented'); }
  getOperation() { throw new Error('ISyncLog.getOperation() not implemented'); }
  getTimestamp() { throw new Error('ISyncLog.getTimestamp() not implemented'); }
  getPayload() { throw new Error('ISyncLog.getPayload() not implemented'); }
}
