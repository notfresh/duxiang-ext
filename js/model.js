// Minimal Link model compatible with existing plain objects.
// Provides `id()`, `hash()` (async), `toPlain()` and factory helpers.
// Designed to be a thin adapter so storage/render code need not change.

(function(global){
  // Use shared sync utilities from `sync/sync.js` only (single source of truth).
  const _syncUtils = (typeof syncUtils !== 'undefined')
    ? syncUtils
    : (typeof require !== 'undefined' ? require('../sync/sync') : null);

  if (!_syncUtils) {
    console.warn('syncUtils not found. Ensure sync/sync.js is loaded before js/model.js.');
  }

  const generateUUIDv4 = _syncUtils && _syncUtils.generateUUIDv4
    ? _syncUtils.generateUUIDv4
    : function(){ throw new Error('generateUUIDv4: syncUtils not available'); };

  const computeObjectHash = _syncUtils && _syncUtils.computeObjectHash
    ? _syncUtils.computeObjectHash
    : async function(){ throw new Error('computeObjectHash: syncUtils not available'); };

  const _BaseSync = (typeof SyncInterface !== 'undefined') ? SyncInterface : class {};

  class Link extends _BaseSync {
    // Accept either a plain object from storage/UI or explicit fields.
    constructor(obj = {}) {
      super();
      // copy known fields but keep any extra fields too
      Object.assign(this, obj);
      // Ensure an id exists (may be numeric from DB; normalize to string)
      if (this.id == null) this.id = generateUUIDv4();
      this._cachedHash = null;
    }

    // Return string id
    id() { return String(this.id); }

    // Derive the content used for hashing. By default pick common link fields.
    // Content is optional; if nothing meaningful exists, an empty object is used.
    content() {
      const c = {};
      if (this.title !== undefined) c.title = this.title;
      if (this.url !== undefined) c.url = this.url;
      if (this.tags !== undefined) c.tags = this.tags;
      // add any other business fields you consider part of content here
      return c;
    }

    // Async; computes content-hash per protocol (hex sha256 of id + '|' + stable stringify(content)).
    /**
     * @override
     */
    async hash() {
      if (this._cachedHash) return this._cachedHash;
      const id = this.id();
      const content = this.content();
      const h = await computeObjectHash(id, content);
      this._cachedHash = h;
      return h;
    }

    // Create a Change representing adding this object (or provided data).
    // data: optional business content to use; defaults to this.content().
    /**
     * @override
     */
    async createChangeAdd(data = null) {
      const content = data || this.content();
      const target_id = this.id();
      const hash = await computeObjectHash(target_id, content);
      return { target_id, action: 'new', data: content, hash };
    }

    // Create a Change representing updating targetId with data.
    /**
     * @override
     */
    async createChangeUpdate(targetId, data) {
      const hash = await computeObjectHash(targetId, data || {});
      return { target_id: String(targetId), action: 'update', data: data || {}, hash };
    }

    // Create a Change representing deleting targetId.
    /**
     * @override
     */
    async createChangeDelete(targetId) {
      return { target_id: String(targetId), action: 'delete', hash: '' };
    }

    // Package changes into an Op (do not persist).
    // deviceId: string, parents: array, changes: array of Change, timestamp: optional ISO string
    /**
     * @override
     */
    async createOp(deviceId, parents, changes, timestamp) {
      if (!_syncUtils || !_syncUtils.computeOpId) throw new Error('syncUtils.computeOpId not available');
      const normParents = (_syncUtils.normalizeParents) ? _syncUtils.normalizeParents(parents) : (parents && parents.length ? parents : ['0'.repeat(64)]);
      const filled = [];
      for (const ch of (changes || [])) {
        const c = Object.assign({}, ch);
        if ((c.action === 'new' || c.action === 'update') && !c.hash) {
          c.hash = await computeObjectHash(c.target_id, c.data || {});
        }
        if (c.action === 'delete' && c.hash === undefined) c.hash = '';
        filled.push(c);
      }
      const changeHashes = filled.map(c => c.hash || '');
      const ts = timestamp || (new Date()).toISOString();
      const op_id = await _syncUtils.computeOpId(deviceId, ts, normParents, changeHashes);
      return { op_id, device_id: deviceId, parents: normParents, timestamp: ts, changes: filled };
    }

    // Return a plain JS object suitable for storage/rendering. Does not modify original fields.
    toPlain() {
      const out = {};
      for (const k of Object.keys(this)) {
        if (k.startsWith('_')) continue;
        out[k] = this[k];
      }
      return out;
    }

    // Factory: create from plain object
    static fromPlain(obj) { return new Link(obj); }

    // Expose computeObjectHash for external reuse
    static computeObjectHash(id, contentObj) { return computeObjectHash(id, contentObj); }
  }

  // Exports for different environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Link };
  }
  if (typeof global !== 'undefined') global.Link = Link;

})(typeof window !== 'undefined' ? window : globalThis);
