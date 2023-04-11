export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

export function parseUserUrl(value) {
  const input = String(value || '').trim();
  if (!input) {
    throw new Error('Missing URL');
  }

  const hadHttpProtocol = isHttpUrl(input);
  const hadOtherProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(input) && !hadHttpProtocol;
  if (hadOtherProtocol) {
    throw new Error('Unsupported URL');
  }

  const candidate = hadHttpProtocol ? input : `https://${input.replace(/^\/+/, '')}`;
  if (!URL.canParse(candidate)) {
    throw new Error('Unsupported URL');
  }

  const parsed = new URL(candidate);
  if (!parsed.hostname || !isHttpUrl(parsed.href)) {
    throw new Error('Unsupported URL');
  }

  return { url: parsed, hadProtocol: hadHttpProtocol };
}

export function encodeRedirectPath(value) {
  return encodeURIComponent(value).replace(/%2F/g, '/');
}
