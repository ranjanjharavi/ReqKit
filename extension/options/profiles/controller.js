import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  cloneRulesIntoProfile,
  countRulesInProfile,
  createProfile,
  getProfileName,
  removeRulesFromProfile,
  validateProfileDraft
} from '../../shared/profiles.js';
import {
  getGrantedOrigins,
  removeOriginPermission,
  requestOriginPermissions,
  storageLocalSet
} from '../../shared/chrome-api.js';
import {
  createDefaultActivation,
  getTargetProfileId,
  setActiveProfile
} from '../../shared/activation.js';
import { setActivationState } from '../../shared/activation-api.js';
import { getMissingProfileOrigins } from '../../shared/site-access.js';
import { getNextRuleId, getRuleOriginPattern } from '../../shared/rules.js';
import { commitRules } from '../../shared/rule-api.js';
import { confirmDestructiveAction } from '../../shared/confirmation-dialog.js';
import { state } from '../state.js';
import { escapeHtml, showStatus } from '../../shared/ui.js';

let refreshAll = async () => {};

export function bindProfileEvents({ onChanged }) {
  refreshAll = onChanged;

  document.getElementById('newProfileBtn').addEventListener('click', createNewProfile);
  document.getElementById('profileList').addEventListener('click', handleProfileListClick);
  document.getElementById('profileTabs').addEventListener('click', handleProfileTabClick);
  document.getElementById('profileTabs').addEventListener('keydown', handleProfileTabKeydown);
  document.getElementById('activeProfileSelect').addEventListener('change', handleActiveProfileChange);
  document.getElementById('manageProfilesBtn').addEventListener('click', openProfileManager);
  document.getElementById('closeProfileManagerBtn').addEventListener('click', closeProfileManager);
  document.getElementById('doneProfileManagerBtn').addEventListener('click', closeProfileManager);
  document.getElementById('profileManagerDialog').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      closeProfileManager();
    }
  });
}

function handleActiveProfileChange(event) {
  const select = event.currentTarget;
  select.disabled = true;
  activateProfile(select.value).finally(() => {
    select.disabled = false;
    renderProfiles();
  });
}

function handleProfileTabClick(event) {
  const tab = event.target.closest('[data-profile-tab]');
  if (!tab || tab.getAttribute('aria-selected') === 'true') {
    return;
  }

  tab.disabled = true;
  activateProfile(tab.dataset.profileTab).finally(() => {
    tab.disabled = false;
    renderProfiles();
  });
}

function handleProfileTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return;
  }

  const tabs = [...event.currentTarget.querySelectorAll('[data-profile-tab]')];
  const currentIndex = tabs.indexOf(event.target.closest('[data-profile-tab]'));
  if (currentIndex < 0 || !tabs.length) {
    return;
  }

  event.preventDefault();
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[nextIndex].focus();
}

function openProfileManager() {
  document.getElementById('profileManagerDialog').showModal();
}

function closeProfileManager() {
  const dialog = document.getElementById('profileManagerDialog');
  if (dialog.open) {
    dialog.close();
  }
}

function handleProfileListClick(event) {
  const button = event.target.closest('[data-profile-action]');
  if (!button) {
    return;
  }

  const { profileAction, id } = button.dataset;
  const actions = {
    rename: () => renameProfile(id),
    duplicate: () => duplicateProfile(id),
    delete: () => deleteProfile(id)
  };

  actions[profileAction]?.();
}

export function renderProfiles() {
  const { profiles, rules } = state;
  const activeProfileId = getTargetProfileId(getActivation());
  const select = document.getElementById('activeProfileSelect');
  const tabs = document.getElementById('profileTabs');
  const list = document.getElementById('profileList');

  const selectSignature = profiles.map((profile) => `${profile.id}:${profile.name}`).join('|');
  if (select.dataset.renderedFor !== selectSignature) {
    select.innerHTML = profiles.map((profile) => (
      `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`
    )).join('');
    select.dataset.renderedFor = selectSignature;
  }
  select.value = activeProfileId;

  tabs.innerHTML = profiles.map((profile) => {
    const isActive = profile.id === activeProfileId;
    const ruleCount = countRulesInProfile(rules, profile.id);

    return `
      <button class="profile-tab" type="button" role="tab" aria-selected="${String(isActive)}" tabindex="${isActive ? '0' : '-1'}" data-profile-tab="${escapeHtml(profile.id)}">
        <span>${escapeHtml(profile.name)}</span>
        <span class="profile-tab-count">${ruleCount}</span>
      </button>
    `;
  }).join('');

  document.getElementById('activeProfileRunLabel').textContent = `${getProfileName(profiles, activeProfileId)} runs until`;

  list.innerHTML = profiles.map((profile) => {
    const ruleCount = countRulesInProfile(rules, profile.id);
    const isActive = profile.id === activeProfileId;

    return `
      <article class="profile-row${isActive ? ' is-active' : ''}">
        <div class="profile-row-main">
          <span class="profile-row-name">${escapeHtml(profile.name)}</span>
          ${isActive ? '<span class="profile-row-badge">Active</span>' : ''}
          <span class="profile-row-count">${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'}</span>
        </div>
        <div class="profile-row-actions">
          <button class="profile-action-btn" type="button" data-profile-action="rename" data-id="${escapeHtml(profile.id)}">Rename</button>
          <button class="profile-action-btn" type="button" data-profile-action="duplicate" data-id="${escapeHtml(profile.id)}">Duplicate</button>
          ${profile.id === DEFAULT_PROFILE_ID
    ? ''
    : `<button class="profile-action-btn danger" type="button" data-profile-action="delete" data-id="${escapeHtml(profile.id)}">Delete</button>`}
        </div>
      </article>
    `;
  }).join('');
}

function getActivation() {
  return state.activation || createDefaultActivation();
}

async function createNewProfile() {
  const name = globalThis.prompt('Name the new profile', '');
  if (name === null) {
    return;
  }

  const validation = validateProfileDraft({ name }, state.profiles);
  if (!validation.ok) {
    showStatus('profileStatus', validation.error, 'error');
    return;
  }

  if (await saveProfiles([...state.profiles, createProfile(validation.profile.name)])) {
    showStatus('profileStatus', `Created ${validation.profile.name}.`, 'success');
  }
}

async function renameProfile(id) {
  const profile = state.profiles.find((candidate) => candidate.id === id);
  if (!profile) {
    return;
  }

  const name = globalThis.prompt('Rename profile', profile.name);
  if (name === null || name.trim() === profile.name) {
    return;
  }

  const validation = validateProfileDraft({ name }, state.profiles, { excludeId: id });
  if (!validation.ok) {
    showStatus('profileStatus', validation.error, 'error');
    return;
  }

  const saved = await saveProfiles(state.profiles.map((candidate) => (
    candidate.id === id ? { ...candidate, name: validation.profile.name } : candidate
  )));
  if (saved) {
    showStatus('profileStatus', `Renamed to ${validation.profile.name}.`, 'success');
  }
}

/**
 * Cloning is the shortest path to a second environment: duplicate, then change
 * the values that differ. The copies start paused so nothing goes live by
 * accident when the new profile is activated.
 */
async function duplicateProfile(id) {
  const source = state.profiles.find((candidate) => candidate.id === id);
  if (!source) {
    return;
  }

  const name = globalThis.prompt('Name the copy', `${source.name} copy`);
  if (name === null) {
    return;
  }

  const validation = validateProfileDraft({ name }, state.profiles);
  if (!validation.ok) {
    showStatus('profileStatus', validation.error, 'error');
    return;
  }

  const newProfile = createProfile(validation.profile.name);
  const clonedRules = cloneRulesIntoProfile(
    state.rules,
    id,
    newProfile.id,
    getNextRuleId(state.rules)
  ).map((rule) => ({ ...rule, enabled: false }));

  try {
    state.syncPaused = true;
    await storeProfiles([...state.profiles, newProfile]);
    await commitRules([...state.rules, ...clonedRules]);
    await refreshAll();
    showStatus(
      'profileStatus',
      `Copied ${clonedRules.length} ${clonedRules.length === 1 ? 'rule' : 'rules'} into ${newProfile.name}, paused.`,
      'success'
    );
  } catch (error) {
    console.error(error);
    showStatus('profileStatus', error.message || 'Could not duplicate that profile.', 'error');
  } finally {
    state.syncPaused = false;
  }
}

async function deleteProfile(id) {
  const profile = state.profiles.find((candidate) => candidate.id === id);
  if (!profile || id === DEFAULT_PROFILE_ID) {
    return;
  }

  const ruleCount = countRulesInProfile(state.rules, id);
  const consequence = ruleCount
    ? `Its ${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'} and related data will also be deleted.`
    : 'It has no rules.';

  const confirmed = await confirmDestructiveAction({
    title: `Delete ${profile.name}?`,
    message: consequence,
    confirmLabel: 'Delete profile'
  });
  if (!confirmed) {
    return;
  }

  const activation = getActivation();
  const referencesDeletedProfile = activation.profileId === id || activation.lastProfileId === id;
  const deletedRules = state.rules.filter((rule) => rule.profileId === id);
  const remainingRules = removeRulesFromProfile(state.rules, id);

  try {
    state.syncPaused = true;
    await commitRules(remainingRules);

    if (referencesDeletedProfile) {
      await setActivationState(setActiveProfile(activation, DEFAULT_PROFILE_ID));
    }

    await storeProfiles(state.profiles.filter((candidate) => candidate.id !== id));
    await releaseDeletedProfilePermissions(deletedRules, remainingRules);
    await refreshAll();
    showStatus('profileStatus', `Deleted ${profile.name}. ${consequence}`, 'success');
  } catch (error) {
    console.error(error);
    showStatus('profileStatus', error.message || 'Could not delete that profile.', 'error');
  } finally {
    state.syncPaused = false;
  }
}

async function releaseDeletedProfilePermissions(deletedRules, remainingRules) {
  const remainingDomains = new Set(remainingRules.map((rule) => rule.domain));
  const origins = new Set(
    deletedRules
      .filter((rule) => !remainingDomains.has(rule.domain))
      .map(getRuleOriginPattern)
  );

  await Promise.all([...origins].map(async (origin) => {
    try {
      await removeOriginPermission(origin);
    } catch (error) {
      console.error(`Could not release site access for ${origin}.`, error);
    }
  }));
}

export async function activateProfile(id) {
  const activation = getActivation();
  if (id === activation.profileId) {
    return;
  }

  // Read from the cached grant list so permissions.request stays inside the
  // click's task — an await here would lose the user gesture Chrome requires.
  const missingOrigins = getMissingProfileOrigins(state.rules, id, state.grantedOrigins);

  let granted = true;
  if (missingOrigins.length) {
    try {
      granted = await requestOriginPermissions(missingOrigins);
    } catch (error) {
      console.error('Could not request site access for that profile.', error);
      granted = false;
    }
    state.grantedOrigins = await readGrantedOrigins();
  }

  try {
    state.syncPaused = true;
    state.activation = await setActivationState(setActiveProfile(activation, id));
    await refreshAll();

    const name = getProfileName(state.profiles, id);
    showStatus(
      'activeSetupStatus',
      granted
        ? `${name} is now active.`
        : `${name} is now active, but some of its rules still need site access.`,
      granted ? 'success' : 'error'
    );
  } catch (error) {
    console.error(error);
    showStatus('activeSetupStatus', error.message || 'Could not activate that profile.', 'error');
  } finally {
    state.syncPaused = false;
  }
}

export async function readGrantedOrigins() {
  try {
    return await getGrantedOrigins();
  } catch (error) {
    console.error('Could not read granted site access.', error);
    return null;
  }
}

async function saveProfiles(profiles) {
  try {
    state.syncPaused = true;
    await storeProfiles(profiles);
    await refreshAll();
    return true;
  } catch (error) {
    console.error(error);
    showStatus('profileStatus', error.message || 'Could not save profiles.', 'error');
    return false;
  } finally {
    state.syncPaused = false;
  }
}

function storeProfiles(profiles) {
  return storageLocalSet({ [PROFILE_STORAGE_KEY]: profiles });
}
