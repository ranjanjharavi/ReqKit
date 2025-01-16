export const TRANSFORMER_RECIPE_KEY = 'transformerRecipe';

const SENSITIVE_KEY_PATTERN = /(auth|token|password|secret|api[_-]?key|cookie|session)/i;
const CREDENTIAL_VALUE_PATTERNS = [
  /^bearer\s+\S+/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  /^[A-Za-z0-9+/_=-]{32,}$/
];

export function createDefaultRecipe() {
  return {
    capturePath: { enabled: false, key: 'redirect' },
    parameters: [
      { id: 'default-disable-js', key: 'disableCustomJs', value: 'true', enabled: true },
      { id: 'default-disable-css', key: 'disableCustomCss', value: 'true', enabled: true }
    ]
  };
}

export function normalizeStoredRecipe(rawRecipe) {
  const validation = validateRecipeDraft(rawRecipe);
  return validation.ok ? validation.recipe : createDefaultRecipe();
}

export function validateRecipeDraft(draft) {
  const capturePath = {
    enabled: Boolean(draft?.capturePath?.enabled),
    key: String(draft?.capturePath?.key || '').trim()
  };
  const parameters = (Array.isArray(draft?.parameters) ? draft.parameters : []).map((parameter) => ({
    id: String(parameter?.id || createParameterId()),
    key: String(parameter?.key || '').trim(),
    value: String(parameter?.value ?? '').trim(),
    enabled: parameter?.enabled !== false
  }));

  if (capturePath.enabled && !capturePath.key) {
    return { ok: false, error: 'Enter the query key that will receive the source path.' };
  }
  if (!parameters.length && !capturePath.enabled) {
    return { ok: false, error: 'Add a query parameter or enable path capture.' };
  }

  const seenKeys = new Set(capturePath.enabled ? [capturePath.key.toLowerCase()] : []);
  for (const parameter of parameters) {
    if (!parameter.key || !parameter.value) {
      return { ok: false, error: 'Every query parameter needs a non-empty key and value.' };
    }
    const normalizedKey = parameter.key.toLowerCase();
    if (seenKeys.has(normalizedKey)) {
      return { ok: false, error: `The query key “${parameter.key}” is used more than once.` };
    }
    seenKeys.add(normalizedKey);
  }

  return { ok: true, recipe: { capturePath, parameters } };
}

export function recipeHasSensitiveValues(recipe) {
  const candidates = [
    ...(recipe?.capturePath?.enabled ? [{ key: recipe.capturePath.key, value: '' }] : []),
    ...(Array.isArray(recipe?.parameters) ? recipe.parameters.filter((parameter) => parameter.enabled) : [])
  ];
  return candidates.some(({ key, value }) => (
    SENSITIVE_KEY_PATTERN.test(String(key || ''))
    || CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(String(value || '').trim()))
  ));
}

export function createParameterId() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `param-${randomPart}`;
}
