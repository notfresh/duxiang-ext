// Sync DTO helpers
export function toSyncLogDTO(log) {
  // Expect log to be plain object or ISyncLog-like
  return {
    logId: log.logId ?? log.getLogId?.(),
    entityType: log.entityType ?? log.getEntityType?.(),
    entityId: log.entityId ?? log.getEntityId?.(),
    operation: log.operation ?? log.getOperation?.(),
    logTimestamp: log.logTimestamp ?? log.getTimestamp?.(),
    payload: log.payload ?? log.getPayload?.()
  };
}

export function fromSyncLogDTO(dto) {
  // For now DTO is identity object used by infra/core
  return { ...dto };
}
