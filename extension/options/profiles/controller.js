import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  cloneRulesIntoProfile,
  countRulesInProfile,
  createProfile,
  getProfileName,
  reassignRulesFromProfile,
  validateProfileDraft
} from '../../shared/profiles.js';
import {
  getGrantedOrigins,
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
import { getNextRuleId } from '../../shared/rules.js';
import { commitRules } from '../../shared/rule-api.js';
import { state } from '../state.js';
import { escapeHtml, showStatus } from '../../shared/ui.js';

let refreshAll = async () => {};

export function bindProfileEvents({ onChanged }) {
  refreshAll = onChanged;

  document.getElementById('newProfileBtn').addEventListener('click', createNewProfile);
  document.getElementById('profileList').addEventListener('click', handleProfileListClick);
}

function handleProfileListClick(event) {
  const button = event.target.closest('[data-profile-action]');
  if (!button) {
    return;
  }

  const { profileAction, id } = button.dataset;
  const actions = {
    activate: () => activateProfile(id),
    rename: () => renameProfile(id),
    duplicate: () => duplicateProfile(id),
    delete: () => deleteProfile(id)
  };

  actions[profileAction]?.();
}

export function renderProfiles() {
  const { profiles, rules } = state;
  const activeProfileId = getActivation().profileId;
  const list = document.getElementById('profileList');

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
          ${isActive
    ? ''
    : `<button class="profile-action-btn primary" type="button" data-profile-action="activate" data-id="${escapeHtml(profile.id)}">Activate</button>`}
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

  await saveProfiles([...state.profiles, createProfile(validation.profile.name)]);
  showStatus('profileStatus', `Created ${validation.profile.name}.`, 'success');
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

  await saveProfiles(state.profiles.map((candidate) => (
    candidate.id === id ? { ...candidate, name: validation.profile.name } : candidate
  )));
  showStatus('profileStatus', `Renamed to ${validation.profile.name}.`, 'success');
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

/**
 * Deleting a profile never deletes rules. They move to Default and are paused,
 * so nothing starts reaching the network as a side effect of a deletion.
 */
async function deleteProfile(id) {
  const profile = state.profiles.find((candidate) => candidate.id === id);
  if (!profile || id === DEFAULT_PROFILE_ID) {
    return;
  }

  const ruleCount = countRulesInProfile(state.rules, id);
  const consequence = ruleCount
    ? `Its ${ruleCount} ${ruleCount === 1 ? 'rule moves' : 'rules move'} to Default and ${ruleCount === 1 ? 'is' : 'are'} paused.`
    : 'It has no rules.';

  if (!globalThis.confirm(`Delete the profile ${profile.name}?\n\n${consequence}`)) {
    return;
  }

  const wasActive = getActivation().profileId === id;

  try {
    state.syncPaused = true;
    await storeProfiles(state.profiles.filter((candidate) => candidate.id !== id));
    await commitRules(reassignRulesFromProfile(state.rules, id, DEFAULT_PROFILE_ID));

    if (wasActive) {
      await setActivationState(setActiveProfile(getActivation(), DEFAULT_PROFILE_ID));
    }

    await refreshAll();
    showStatus('profileStatus', `Deleted ${profile.name}. ${consequence}`, 'success');
  } catch (error) {
    console.error(error);
    showStatus('profileStatus', error.message || 'Could not delete that profile.', 'error');
  } finally {
    state.syncPaused = false;
  }
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
      'profileStatus',
      granted
        ? `${name} is now active.`
        : `${name} is now active, but some of its rules still need site access.`,
      granted ? 'success' : 'error'
    );
  } catch (error) {
    console.error(error);
    showStatus('profileStatus', error.message || 'Could not activate that profile.', 'error');
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
  } catch (error) {
    console.error(error);
    showStatus('profileStatus', error.message || 'Could not save profiles.', 'error');
  } finally {
    state.syncPaused = false;
  }
}

function storeProfiles(profiles) {
  return storageLocalSet({ [PROFILE_STORAGE_KEY]: profiles });
}

export function getActiveProfileId() {
  return getTargetProfileId(getActivation());
}
