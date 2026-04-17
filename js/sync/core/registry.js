const _providers = new Map();

export function register(entityType, provider) {
  if (!_providers.has(entityType)) _providers.set(entityType, provider);
}

export function getProvider(entityType) {
  return _providers.get(entityType);
}

export function mustGetProvider(entityType) {
  const p = getProvider(entityType);
  if (!p) throw new Error(`No provider registered for entityType=${entityType}`);
  return p;
}

export function getRegisteredEntityTypes() {
  return Array.from(_providers.keys());
}
