// Simple HTTP transport for sync pull/push
export class HttpTransport {
  constructor({ baseUrlForPeer = (peerId) => peerId, fetchImpl = fetch } = {}) {
    this.baseUrlForPeer = baseUrlForPeer;
    this.fetch = fetchImpl;
  }

  async pull(peerId, entityType, lastCursor) {
    const base = this.baseUrlForPeer(peerId);
    const url = new URL('/sync/pull', base);
    url.searchParams.set('entityType', entityType);
    if (lastCursor != null) url.searchParams.set('cursor', lastCursor);

    try {
      const res = await this.fetch(url.toString(), { method: 'GET', credentials: 'omit' });
      if (!res.ok) return { success: false, status: res.status };
      const body = await res.json();
      return body;
    } catch (e) {
      return { success: false, reason: e.message };
    }
  }

  async push(peerId, entityType, items) {
    const base = this.baseUrlForPeer(peerId);
    const url = new URL('/sync/push', base);
    try {
      const res = await this.fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, items }),
        credentials: 'omit'
      });
      if (!res.ok) return { success: false, status: res.status };
      const body = await res.json();
      return body;
    } catch (e) {
      return { success: false, reason: e.message };
    }
  }
}

export default HttpTransport;
