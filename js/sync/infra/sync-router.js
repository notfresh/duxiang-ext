import { getRuntime } from '../bootstrap.js';

// Mount message-based sync router using chrome.runtime.onMessageExternal
export function mountSyncRouter() {
  console.log('[sync-router] mounting sync router');
  chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
    try {
      const runtime = getRuntime();
      if (!runtime || !runtime.engine) {
        sendResponse({ success: false, reason: 'sync runtime not initialized' });
        return true;
      }

      if (!message || !message.type) {
        sendResponse({ success: false, reason: 'invalid message' });
        return true;
      }

      if (message.type === 'sync.pull') {
        const { entityType, cursor } = message;
        const res = await runtime.engine.onPullRequest(entityType, cursor);
        sendResponse(res);
        return true;
      }

      if (message.type === 'sync.push') {
        const { entityType, items } = message;
        const res = await runtime.engine.onPushRequest(entityType, items);
        sendResponse(res);
        return true;
      }

      sendResponse({ success: false, reason: 'unsupported message type' });
    } catch (e) {
      console.error('[sync-router] error handling message', e);
      sendResponse({ success: false, reason: e.message });
    }
    return true; // indicate async response
  });
}

export default { mountSyncRouter };
