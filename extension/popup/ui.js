export function showStatus(elementId, message, type) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = `status-msg visible ${type}`;
  globalThis.clearTimeout(element._statusTimer);
  element._statusTimer = globalThis.setTimeout(() => {
    element.className = 'status-msg';
  }, 2800);
}

export function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.error('navigator.clipboard.writeText failed. Falling back to execCommand.', error);
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('document.execCommand("copy") returned false.');
    }
  } finally {
    textarea.remove();
  }
}
