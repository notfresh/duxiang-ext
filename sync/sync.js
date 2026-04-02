// Core sync utilities: stable serialization, hashing, op id computation, parents normalization.
// Place sync-specific logic here (per workspace convention).

(function(global){
  const GENESIS_OP_ID = '0'.repeat(64);

  function isPlainObject(v){
    return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
  }

  function stableStringify(obj) {
    const seen = new Set();
    function _stringify(v){
      if (v === null) return 'null';
      if (v === undefined) return 'null';
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (typeof v === 'string') return JSON.stringify(v);
      if (v instanceof Date) return JSON.stringify(v.toISOString());
      if (Array.isArray(v)) return '[' + v.map(_stringify).join(',') + ']';
      if (typeof v === 'object'){
        if (seen.has(v)) throw new Error('stableStringify: circular reference');
        seen.add(v);
        const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
        const body = keys.map(k => JSON.stringify(k) + ':' + _stringify(v[k])).join(',');
        seen.delete(v);
        return '{' + body + '}';
      }
      return 'null';
    }
    return _stringify(obj);
  }

  async function sha256Hex(str){
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function generateUUIDv4(){
    const rnds = crypto.getRandomValues(new Uint8Array(16));
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;
    const hex = Array.from(rnds).map(b => b.toString(16).padStart(2,'0'));
    return [hex.slice(0,4).join(''), hex.slice(4,6).join(''), hex.slice(6,8).join(''), hex.slice(8,10).join(''), hex.slice(10,16).join('')].join('-');
  }

  async function computeObjectHash(id, contentObj){
    const contentStr = stableStringify(contentObj || {});
    return await sha256Hex(id + '|' + contentStr);
  }

  function normalizeParents(parents){
    if (!parents || parents.length === 0) return [GENESIS_OP_ID];
    return parents;
  }

  async function computeOpId(deviceId, timestamp, parents, changeHashes){
    const normParents = normalizeParents(parents);
    const parts = [String(deviceId), String(timestamp), normParents.join(','), (changeHashes || []).join(',')];
    const s = parts.join('|');
    return await sha256Hex(s);
  }

  // exports
  const exports = {
    GENESIS_OP_ID,
    stableStringify,
    sha256Hex,
    generateUUIDv4,
    computeObjectHash,
    normalizeParents,
    computeOpId
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  if (typeof global !== 'undefined') global.syncUtils = exports;

})(typeof window !== 'undefined' ? window : globalThis);
