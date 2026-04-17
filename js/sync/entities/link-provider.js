import { getDBInstance } from '../../storage.js';
import { getStore } from '../../idb.js';
import { addLink, updateLink, deleteLink, getLinkByUrl, batchAddLinks } from '../../storage.js';

// Optional infra helpers (may be implemented later)
let listLogsAfter = null;
let appendLog = null;
try {
  // eslint-disable-next-line import/no-unresolved
  const repo = await import('../infra/sync-log-repo.js');
  listLogsAfter = repo.listLogsAfter;
  appendLog = repo.appendLog;
} catch (e) {
  // infra not ready yet
}

export class LinkSyncProvider {
  getEntityType() { return 'LINK'; }

  async getChangedLogs(lastCursor) {
    if (typeof listLogsAfter === 'function') {
      return await listLogsAfter('LINK', lastCursor, 100);
    }
    return [];
  }

  async getEntityById(entityId) {
    // entityId expected to be numeric id used in storage.js
    const db = await getDBInstance();
    const store = getStore(db, 'links', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(Number(entityId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async upsert(entity, context = { source: 'local' }) {
    // entity may be plain object {id?, title, url, tags, timestamp}
    if (!entity) throw new Error('upsert: entity required');

    const payload = {
      title: entity.title || '',
      url: entity.url || '',
      tags: Array.isArray(entity.tags) ? entity.tags : (entity.tags || ''),
      timestamp: entity.timestamp || new Date().toISOString()
    };

    if (entity.id) {
      await updateLink(entity.id, payload);
      // append sync log for local changes
      if (context.source === 'local' && typeof appendLog === 'function') {
        await appendLog('LINK', entity.id, 'UPDATE', payload);
      }
      return entity.id;
    } else {
      // try to avoid duplicates by URL
      const existing = await getLinkByUrl(payload.url);
      if (existing) {
        // update existing
        await updateLink(existing.id, payload);
        if (context.source === 'local' && typeof appendLog === 'function') {
          await appendLog('LINK', existing.id, 'UPDATE', payload);
        }
        return existing.id;
      }

      const id = await addLink(payload);
      if (context.source === 'local' && typeof appendLog === 'function') {
        await appendLog('LINK', id, 'CREATE', payload);
      }
      return id;
    }
  }

  async delete(entityId, context = { source: 'local' }) {
    await deleteLink(entityId);
    if (context.source === 'local' && typeof appendLog === 'function') {
      await appendLog('LINK', entityId, 'DELETE', null);
    }
  }
}

export default LinkSyncProvider;
