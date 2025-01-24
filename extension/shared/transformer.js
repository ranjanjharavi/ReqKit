import { encodeRedirectPath, parseUserUrl } from './urls.js';
import { validateRecipeDraft } from './recipes.js';

export function buildTransformedUrl(sourceValue, recipe) {
  const parsed = parseUserUrl(sourceValue);
  const validation = validateRecipeDraft(recipe);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const normalizedRecipe = validation.recipe;
  const enabledParameters = normalizedRecipe.parameters.filter((parameter) => parameter.enabled);
  if (!normalizedRecipe.capturePath.enabled && enabledParameters.length === 0) {
    throw new Error('Enable path capture or at least one query parameter.');
  }

  return normalizedRecipe.capturePath.enabled
    ? buildCapturedUrl(parsed.url, normalizedRecipe, enabledParameters)
    : buildMergedUrl(parsed.url, enabledParameters);
}

function buildCapturedUrl(sourceUrl, recipe, parameters) {
  const capturedValue = `${sourceUrl.pathname || '/'}${sourceUrl.search}${sourceUrl.hash}`;
  const target = new URL(`${sourceUrl.origin}/`);
  const entries = [
    `${encodeURIComponent(recipe.capturePath.key)}=${encodeRedirectPath(capturedValue)}`,
    ...parameters.map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  ];
  target.search = entries.join('&');
  return target.href;
}

function buildMergedUrl(sourceUrl, parameters) {
  const target = new URL(sourceUrl.href);
  parameters.forEach(({ key, value }) => target.searchParams.set(key, value));
  return target.href;
}
