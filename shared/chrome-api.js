export function storageAreaGet(storageArea, query, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    storageArea.get(query, (result) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(result || {});
    });
  });
}

export function storageAreaSet(storageArea, value, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    storageArea.set(value, () => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function storageLocalGet(query, chromeApi = globalThis.chrome) {
  return storageAreaGet(chromeApi.storage.local, query, chromeApi);
}

export function storageLocalSet(value, chromeApi = globalThis.chrome) {
  return storageAreaSet(chromeApi.storage.local, value, chromeApi);
}

export function getDynamicRules(chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.declarativeNetRequest.getDynamicRules((rules) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(rules || []);
    });
  });
}

export function updateDynamicRules(details, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.declarativeNetRequest.updateDynamicRules(details, () => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function sendRuntimeMessage(message, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.runtime.sendMessage(message, (response) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

export function getCurrentTab(chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(tabs?.[0] || null);
    });
  });
}

export function isAllowedIncognitoAccess(chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.extension.isAllowedIncognitoAccess((isAllowed) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(Boolean(isAllowed));
    });
  });
}

export function getAllWindows(query, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.windows.getAll(query || { populate: false }, (windows) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(windows || []);
    });
  });
}

export function createTab(details, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.tabs.create(details, (tab) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(tab || null);
    });
  });
}

export function createWindow(details, chromeApi = globalThis.chrome) {
  return new Promise((resolve, reject) => {
    chromeApi.windows.create(details, (windowInfo) => {
      const error = getRuntimeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }
      resolve(windowInfo || null);
    });
  });
}

function getRuntimeError(chromeApi) {
  const message = chromeApi?.runtime?.lastError?.message;
  return message ? new Error(message) : null;
}
