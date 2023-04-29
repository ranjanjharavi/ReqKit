import { encodeRedirectPath, parseUserUrl } from './urls.js';

export const QUERY_PRESETS = Object.freeze({
  disableCustomCode: Object.freeze({
    disableCustomJs: 'true',
    disableCustomCss: 'true'
  })
});

export function buildTransformedUrl(sourceValue, {
  authRedirect = false,
  authToken = '',
  queryPresets = []
} = {}) {
  if (!Array.isArray(queryPresets)) {
    throw new Error('Query presets must be an array');
  }

  const selectedPresets = [...new Set(queryPresets)];
  if (!authRedirect && !selectedPresets.length) {
    throw new Error('Missing transformation option');
  }

  const parsed = parseUserUrl(sourceValue);
  const targetUrl = new URL(parsed.url.href);
  selectedPresets.forEach((presetName) => applyQueryPreset(targetUrl, presetName));

  if (!authRedirect) {
    return buildResult(targetUrl.href, parsed.hadProtocol);
  }

  const token = String(authToken || '').trim();
  if (!token) {
    throw new Error('Missing auth token');
  }

  const redirectPath = `${targetUrl.pathname || '/'}${targetUrl.search}${targetUrl.hash}` || '/';
  const authParam = `auth_token=${encodeURIComponent(token)}`;
  const redirectParam = `redirect=${encodeRedirectPath(redirectPath)}`;
  const browserUrl = `${targetUrl.origin}/?${authParam}&${redirectParam}`;

  return buildResult(browserUrl, parsed.hadProtocol);
}

export function buildAuthRedirectUrl(sourceValue, authToken) {
  return buildTransformedUrl(sourceValue, {
    authRedirect: true,
    authToken
  });
}

function applyQueryPreset(targetUrl, presetName) {
  const preset = QUERY_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown query preset: ${presetName}`);
  }

  Object.entries(preset).forEach(([name, value]) => {
    targetUrl.searchParams.set(name, value);
  });
}

function buildResult(browserUrl, hadProtocol) {
  const displayUrl = hadProtocol ? browserUrl : browserUrl.replace(/^https?:\/\//i, '');
  return { browserUrl, displayUrl };
}
