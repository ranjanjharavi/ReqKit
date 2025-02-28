import assert from 'node:assert/strict';
import test from 'node:test';

import { showStatus } from '../extension/shared/ui.js';

test('showStatus preserves component classes while adding transient state', () => {
  const classes = new Set(['status-msg', 'workspace-status']);
  const element = {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name))
    },
    textContent: ''
  };
  let dismissStatus = () => {};
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.document = { getElementById: () => element };
  globalThis.setTimeout = (callback) => {
    dismissStatus = callback;
    return 1;
  };
  globalThis.clearTimeout = () => {};

  try {
    showStatus('status', 'Default is now active.', 'success');
    assert.equal(element.textContent, 'Default is now active.');
    assert.deepEqual([...classes].sort(), ['status-msg', 'success', 'visible', 'workspace-status']);

    dismissStatus();
    assert.deepEqual([...classes].sort(), ['status-msg', 'workspace-status']);
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
