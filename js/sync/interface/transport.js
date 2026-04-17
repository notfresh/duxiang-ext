export class INetworkTransport {
  // pull: should return { success:true, data:{ logs: [...], latestCursor } } or throw
  async pull(peerId, entityType, cursor) { throw new Error('INetworkTransport.pull() not implemented'); }

  // push: send list of SyncLogDTO to peer; return { success, ackCursor }
  async push(peerId, entityType, items) { throw new Error('INetworkTransport.push() not implemented'); }
}
