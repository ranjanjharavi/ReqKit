import { createTab, storageLocalGet, storageLocalSet } from '../../shared/chrome-api.js';
import {
  TRANSFORMER_RECIPE_KEY,
  createDefaultRecipe,
  createParameterId,
  normalizeStoredRecipe,
  recipeHasSensitiveValues,
  validateRecipeDraft
} from '../../shared/recipes.js';
import { buildTransformedUrl } from '../../shared/transformer.js';
import { parseUserUrl } from '../../shared/urls.js';
import { state } from '../state.js';
import { copyToClipboard, escapeHtml, showStatus } from '../ui.js';

export function bindTransformerEvents() {
  const sourceInput = document.getElementById('sourceUrl');
  sourceInput.addEventListener('input', () => {
    state.transformer.result = null;
    renderOutput();
  });
  sourceInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      transformCurrentUrl();
    }
  });

  document.getElementById('transformUrlBtn').addEventListener('click', transformCurrentUrl);
  document.getElementById('copyUrlBtn').addEventListener('click', copyTransformedUrl);
  document.getElementById('openUrlBtn').addEventListener('click', openTransformedUrl);
  document.getElementById('editRecipeBtn').addEventListener('click', openRecipeEditor);
  document.getElementById('resetRecipeBtn').addEventListener('click', resetRecipe);
  document.getElementById('recipeSummary').addEventListener('click', handleRecipeSummaryClick);
  document.getElementById('cancelRecipeBtn').addEventListener('click', closeRecipeEditor);
  document.getElementById('recipeForm').addEventListener('submit', saveRecipe);
  document.getElementById('recipeForm').addEventListener('input', syncEditorDraftFromForm);
  document.getElementById('capturePathToggle').addEventListener('change', renderCaptureKeyField);
  document.getElementById('addParameterBtn').addEventListener('click', addEditorParameter);
  document.getElementById('parameterEditorList').addEventListener('click', removeEditorParameter);
}

export async function initializeTransformer(activeTab) {
  const stored = await storageLocalGet({ [TRANSFORMER_RECIPE_KEY]: createDefaultRecipe() });
  state.transformer.recipe = normalizeStoredRecipe(stored[TRANSFORMER_RECIPE_KEY]);

  if (activeTab?.url) {
    try {
      parseUserUrl(activeTab.url);
      document.getElementById('sourceUrl').value = activeTab.url;
    } catch {
      // Chrome pages and other unsupported URLs are intentionally ignored.
    }
  }

  renderTransformer();
}

function renderTransformer() {
  renderRecipe();
  renderOutput();
}

function renderRecipe() {
  const recipe = state.transformer.recipe || createDefaultRecipe();
  const editorOpen = state.transformer.editor.open;
  const summary = document.getElementById('recipeSummary');
  summary.hidden = editorOpen;
  summary.innerHTML = buildRecipeSummary(recipe);
  document.getElementById('editRecipeBtn').disabled = editorOpen;
  document.getElementById('resetRecipeBtn').disabled = editorOpen;
  document.getElementById('sensitiveWarning').hidden = editorOpen || !recipeHasSensitiveValues(recipe);
}

function buildRecipeSummary(recipe) {
  const capture = recipe.capturePath;
  const rows = [
    ...(capture.enabled ? [`
      <div class="recipe-capture-row">
        <button class="mini-switch active" type="button" role="switch" aria-checked="true" data-summary-action="toggle-capture" aria-label="Disable path capture"></button>
        <span>Path → <code>${escapeHtml(capture.key)}</code></span>
      </div>`] : []),
    ...recipe.parameters.filter((parameter) => parameter.enabled).map((parameter) => `
      <div class="recipe-parameter-row">
        <button class="mini-switch active" type="button" role="switch" aria-checked="true" data-summary-action="toggle-parameter" data-parameter-id="${escapeHtml(parameter.id)}" aria-label="Disable ${escapeHtml(parameter.key)}"></button>
        <code>${escapeHtml(parameter.key)}</code><span>=</span><code>${escapeHtml(parameter.value)}</code>
      </div>`)
  ];

  return rows.length
    ? rows.join('')
    : '<div class="recipe-empty-row">No active transformations</div>';
}

function renderOutput() {
  const result = state.transformer.result;
  document.getElementById('transformedUrlField').hidden = !result;
  document.getElementById('transformedUrl').value = result || '';
  document.getElementById('copyUrlBtn').disabled = !result;
  document.getElementById('openUrlBtn').disabled = !result;
}

async function persistRecipe() {
  await storageLocalSet({ [TRANSFORMER_RECIPE_KEY]: state.transformer.recipe });
}

function transformCurrentUrl() {
  try {
    state.transformer.result = buildTransformedUrl(
      document.getElementById('sourceUrl').value,
      state.transformer.recipe
    );
    renderOutput();
    showStatus('transformerStatus', 'URL transformed.', 'success');
  } catch (error) {
    state.transformer.result = null;
    renderOutput();
    showStatus('transformerStatus', error.message || 'Could not transform this URL.', 'error');
  }
}

async function copyTransformedUrl() {
  if (!state.transformer.result) {
    return;
  }
  try {
    await copyToClipboard(state.transformer.result);
    showStatus('transformerStatus', 'URL copied.', 'success');
  } catch {
    showStatus('transformerStatus', 'Could not copy the URL.', 'error');
  }
}

async function openTransformedUrl() {
  if (!state.transformer.result) {
    return;
  }
  try {
    await createTab({ url: state.transformer.result, active: true });
  } catch {
    showStatus('transformerStatus', 'Could not open a new tab.', 'error');
  }
}

async function handleRecipeSummaryClick(event) {
  const button = event.target.closest('[data-summary-action]');
  if (!button) {
    return;
  }

  const previousRecipe = structuredClone(state.transformer.recipe);
  if (button.dataset.summaryAction === 'toggle-capture') {
    state.transformer.recipe.capturePath.enabled = !state.transformer.recipe.capturePath.enabled;
  } else if (button.dataset.summaryAction === 'toggle-parameter') {
    const parameter = state.transformer.recipe.parameters
      .find((item) => item.id === button.dataset.parameterId);
    if (parameter) {
      parameter.enabled = !parameter.enabled;
    }
  }

  try {
    await persistRecipe();
    state.transformer.result = null;
    renderTransformer();
  } catch {
    state.transformer.recipe = previousRecipe;
    renderRecipe();
    showStatus('transformerStatus', 'Could not save the recipe setting.', 'error');
  }
}

function openRecipeEditor() {
  state.transformer.editor = {
    open: true,
    draft: structuredClone(state.transformer.recipe)
  };
  renderRecipe();
  renderRecipeEditor();
  document.getElementById('capturePathToggle').focus();
}

function closeRecipeEditor() {
  state.transformer.editor = { open: false, draft: null };
  document.getElementById('recipeEditor').hidden = true;
  renderRecipe();
}

function renderRecipeEditor() {
  const { editor } = state.transformer;
  const container = document.getElementById('recipeEditor');
  container.hidden = !editor.open;
  if (!editor.open) {
    return;
  }

  const draft = editor.draft;
  document.getElementById('capturePathToggle').checked = draft.capturePath.enabled;
  document.getElementById('capturePathKey').value = draft.capturePath.key;
  renderCaptureKeyField();
  document.getElementById('parameterEditorList').innerHTML = draft.parameters.length
    ? draft.parameters.map(buildEditorParameterRow).join('')
    : '<div class="recipe-empty-row">No query parameters. Add one or enable path capture.</div>';
}

function buildEditorParameterRow(parameter) {
  return `
    <div class="parameter-editor-row" data-parameter-id="${escapeHtml(parameter.id)}">
      <label class="parameter-enabled" title="Enable parameter"><input type="checkbox" data-field="enabled"${parameter.enabled ? ' checked' : ''}><span class="sr-only">Enabled</span></label>
      <input type="text" data-field="key" value="${escapeHtml(parameter.key)}" placeholder="key" aria-label="Query parameter key" autocomplete="off">
      <span aria-hidden="true">=</span>
      <input type="text" data-field="value" value="${escapeHtml(parameter.value)}" placeholder="value" aria-label="Query parameter value" autocomplete="off">
      <button class="icon-btn danger" type="button" data-remove-parameter aria-label="Remove parameter" title="Remove"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 7.25h10v1.5H3v-1.5Z"/></svg></button>
    </div>`;
}

function renderCaptureKeyField() {
  document.getElementById('capturePathKeyField').hidden = !document.getElementById('capturePathToggle').checked;
}

function syncEditorDraftFromForm() {
  const draft = state.transformer.editor.draft;
  if (!draft) {
    return;
  }
  draft.capturePath.enabled = document.getElementById('capturePathToggle').checked;
  draft.capturePath.key = document.getElementById('capturePathKey').value;
  draft.parameters = Array.from(document.querySelectorAll('.parameter-editor-row')).map((row) => ({
    id: row.dataset.parameterId,
    enabled: row.querySelector('[data-field="enabled"]').checked,
    key: row.querySelector('[data-field="key"]').value,
    value: row.querySelector('[data-field="value"]').value
  }));
}

function addEditorParameter() {
  syncEditorDraftFromForm();
  state.transformer.editor.draft.parameters.push({
    id: createParameterId(),
    key: '',
    value: '',
    enabled: true
  });
  renderRecipeEditor();
  document.querySelector('.parameter-editor-row:last-child [data-field="key"]')?.focus();
}

function removeEditorParameter(event) {
  const button = event.target.closest('[data-remove-parameter]');
  if (!button) {
    return;
  }
  syncEditorDraftFromForm();
  const parameterId = button.closest('.parameter-editor-row').dataset.parameterId;
  state.transformer.editor.draft.parameters = state.transformer.editor.draft.parameters
    .filter((parameter) => parameter.id !== parameterId);
  renderRecipeEditor();
}

async function saveRecipe(event) {
  event.preventDefault();
  syncEditorDraftFromForm();
  const validation = validateRecipeDraft(state.transformer.editor.draft);
  if (!validation.ok) {
    showStatus('recipeEditorStatus', validation.error, 'error');
    return;
  }

  const previousRecipe = state.transformer.recipe;
  state.transformer.recipe = validation.recipe;
  try {
    await persistRecipe();
    state.transformer.result = null;
    closeRecipeEditor();
    renderOutput();
    showStatus('transformerStatus', 'Default recipe saved.', 'success');
  } catch {
    state.transformer.recipe = previousRecipe;
    showStatus('recipeEditorStatus', 'Could not save the default recipe.', 'error');
  }
}

async function resetRecipe() {
  if (!globalThis.confirm('Reset the default recipe?')) {
    return;
  }

  const previousRecipe = state.transformer.recipe;
  state.transformer.recipe = createDefaultRecipe();
  try {
    await persistRecipe();
    state.transformer.result = null;
    renderTransformer();
    showStatus('transformerStatus', 'Default recipe reset.', 'success');
  } catch {
    state.transformer.recipe = previousRecipe;
    renderRecipe();
    showStatus('transformerStatus', 'Could not reset the default recipe.', 'error');
  }
}
