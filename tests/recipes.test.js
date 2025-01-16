import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultRecipe,
  normalizeStoredRecipe,
  recipeHasSensitiveValues,
  validateRecipeDraft
} from '../extension/shared/recipes.js';

test('the default recipe contains editable custom-code parameters', () => {
  assert.deepEqual(createDefaultRecipe(), {
    capturePath: { enabled: false, key: 'redirect' },
    parameters: [
      { id: 'default-disable-js', key: 'disableCustomJs', value: 'true', enabled: true },
      { id: 'default-disable-css', key: 'disableCustomCss', value: 'true', enabled: true }
    ]
  });
});

test('recipe validation requires non-empty keys and values', () => {
  const recipe = createDefaultRecipe();
  recipe.parameters[0].value = '';
  assert.match(validateRecipeDraft(recipe).error, /non-empty key and value/);

  recipe.parameters[0].value = 'true';
  recipe.parameters[1].key = recipe.parameters[0].key.toUpperCase();
  assert.match(validateRecipeDraft(recipe).error, /used more than once/);
});

test('path capture key cannot duplicate a parameter key', () => {
  const recipe = createDefaultRecipe();
  recipe.capturePath = { enabled: true, key: 'disableCustomJs' };
  assert.match(validateRecipeDraft(recipe).error, /used more than once/);
});

test('sensitive-looking query values warn without invalidating the recipe', () => {
  const recipe = createDefaultRecipe();
  recipe.parameters[0] = { id: 'auth', key: 'auth_token', value: 'example', enabled: true };
  assert.equal(recipeHasSensitiveValues(recipe), true);
  assert.equal(validateRecipeDraft(recipe).ok, true);

  recipe.parameters[0] = { id: 'safe', key: 'mode', value: 'development', enabled: true };
  assert.equal(recipeHasSensitiveValues(recipe), false);
});

test('invalid stored data falls back to the default recipe', () => {
  assert.deepEqual(normalizeStoredRecipe({}), createDefaultRecipe());
});
