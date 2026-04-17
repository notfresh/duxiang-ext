export class ISyncCursorManager {
  async getPullCursor(peerId, entityType) { throw new Error('ISyncCursorManager.getPullCursor() not implemented'); }
  async savePullCursor(peerId, entityType, cursor) { throw new Error('ISyncCursorManager.savePullCursor() not implemented'); }

  async getPushCursor(peerId, entityType) { throw new Error('ISyncCursorManager.getPushCursor() not implemented'); }
  async savePushCursor(peerId, entityType, cursor) { throw new Error('ISyncCursorManager.savePushCursor() not implemented'); }
}
