import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCurrentTab,
  sendRuntimeMessage,
  storageLocalGet
} from '../shared/chrome-api.js';

function createChromeApi() {
  return {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        callback({ ok: true, echo: message });
      }
    },
    storage: {
      local: {
        get(query, callback) {
          callback({ query });
        }
      }
    },
    tabs: {
      query(query, callback) {
        callback([{ id: 7, url: 'https://example.com' }]);
      }
    }
  };
}

test('Chrome API wrappers resolve callback results', async () => {
  const chromeApi = createChromeApi();

  assert.deepEqual(await storageLocalGet(['key'], chromeApi), { query: ['key'] });
  assert.deepEqual(await getCurrentTab(chromeApi), { id: 7, url: 'https://example.com' });
  assert.deepEqual(await sendRuntimeMessage({ type: 'test' }, chromeApi), {
    ok: true,
    echo: { type: 'test' }
  });
});

test('Chrome API wrappers reject runtime.lastError', async () => {
  const chromeApi = createChromeApi();
  chromeApi.storage.local.get = (query, callback) => {
    chromeApi.runtime.lastError = { message: 'Storage unavailable' };
    callback({});
    chromeApi.runtime.lastError = null;
  };

  await assert.rejects(storageLocalGet(['key'], chromeApi), /Storage unavailable/);
});
