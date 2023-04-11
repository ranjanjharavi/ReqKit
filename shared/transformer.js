import { encodeRedirectPath, parseUserUrl } from './urls.js';

export function buildAuthRedirectUrl(sourceValue, authToken) {
  const token = String(authToken || '').trim();
  if (!token) {
    throw new Error('Missing auth token');
  }

  const parsed = parseUserUrl(sourceValue);
  const redirectPath = `${parsed.url.pathname || '/'}${parsed.url.search}${parsed.url.hash}` || '/';
  const authParam = `auth_token=${encodeURIComponent(token)}`;
  const redirectParam = `redirect=${encodeRedirectPath(redirectPath)}`;
  const browserUrl = `${parsed.url.origin}/?${authParam}&${redirectParam}`;
  const displayUrl = parsed.hadProtocol ? browserUrl : browserUrl.replace(/^https?:\/\//i, '');

  return { browserUrl, displayUrl };
}
