# ReqKit

ReqKit is a lightweight Chrome extension for creating, organizing, and temporarily applying profile-based request-header rules to exact HTTPS hosts. It is built for API and web-environment testing.

## Features

### Request headers

- Creates request-header rules for exact HTTPS hostnames, with optional path-prefix and API (fetch/XHR) scoping.
- Requests optional site access only when a rule is created or enabled.
- Supports enabling, pausing, editing, and deleting rules.
- Applies enabled rules through Chrome's `declarativeNetRequest` API. By default, a rule matches all request types for that host; optional scopes can limit it to a path and nested paths, and/or fetch/XHR requests.
- Detects conflicting active rules for the same host and header when their request scopes overlap.
- Masks sensitive-looking header values in the popup until explicitly revealed.
- Removes site access after the final rule for a hostname is deleted.
- Includes a site-access overview to audit granted hosts, see the saved rules covered by each grant, and revoke access without deleting those rules.

Use header modification only with systems you are authorized to test.

### Profiles

Rules are grouped into profiles, and one profile is active at a time. Rules in the other
profiles keep their own on/off state and are simply not applied, so the same header can hold
a different value in each environment without the two ever colliding.

- The popup shows the selected profile and how long it will apply. The adjacent **Change**
  action opens the active setup in the rule manager.
- The rule manager creates, renames, duplicates, and deletes profiles, and its edit form moves
  a rule between them.
- Duplicating a profile copies its rules paused, so nothing goes live by accident.
- Deleting a profile also deletes every request-header rule assigned to it.
- Switching to a profile asks for any site access it still needs in one prompt. If you
  decline, the switch still happens and affected rules are flagged with a Grant button.

### Auto-off timer

Rules can be set to apply for **1 hour**, **8 hours**, **until Chrome closes**, or until you
turn them off. When the time is up ReqKit parks the active profile: every rule stops being
applied, but nothing is edited or deleted, so resuming is one click.

The timer belongs to the activation rather than to a profile. Switching profiles disarms it,
and choosing a duration arms a fresh one. The remaining time is rounded, and a Chrome alarm
stops the rules even when no ReqKit page is open.

### Pausing everything

A single switch pauses every header rule without deleting anything or changing any rule's
own on/off state. Resuming restores exactly what was there before.

While rules are paused the toolbar badge reads `off`, and both the popup and the rule
manager show a banner. The badge stays blank when there was nothing to apply anyway.

The badge otherwise counts the rules active on the site you are looking at, falling back to
the profile-wide count on pages whose address ReqKit has no access to read.

### Popup and rule manager

The popup answers one question: what ReqKit is doing to the current site. It lists that
host's rules, adds new ones, and shows the selected profile and activation lifetime.

The rule manager is a full page, opened from the popup or from **Extension options** in
`chrome://extensions`. It manages profiles, activation timing, and all request-header rules.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+R` | Open the ReqKit popup. |
| `Alt+Shift+X` | Pause or resume every header rule without opening the popup. The badge shows `off` while rules are paused. |

Both are editable at `chrome://extensions/shortcuts`.

## Install locally

ReqKit requires Chrome 120 or later.

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository's `extension` directory.
6. Pin ReqKit from Chrome's Extensions menu if desired.

Changes to extension files require clicking **Reload** on the ReqKit card in `chrome://extensions`.

## Permissions

| Permission | Why ReqKit needs it |
|---|---|
| `activeTab` | Reads the active tab URL locally only after you open ReqKit, so the popup can identify the current hostname and show matching rules. It does not read page content or general browsing history. |
| `alarms` | Runs the user-selected automatic expiry so active request-header rules stop applying even when no ReqKit page is open. |
| `storage` | Stores privacy consent, profiles, activation settings, and request-header rules locally in the current Chrome profile. |
| `declarativeNetRequestWithHostAccess` | Applies user-created request-header rules to approved HTTPS hosts without injecting scripts or reading response bodies. |
| Optional `https://*/*` host access | Lets ReqKit ask Chrome for access to the exact HTTPS host you choose when creating or enabling a rule. This optional pattern enables exact-host prompts; it does not grant ReqKit required access to every website. Review and revoke granted hosts from the rule manager's **Site access** overview. |

## Privacy and security

Read the [privacy policy](privacy/policy.md).

## Development

The project uses browser-native JavaScript modules and has no runtime package dependencies.

Run the tests:

```bash
npm test
```

Regenerate the extension and GitHub Pages privacy-policy HTML from the canonical Markdown source:

```bash
npm run build:privacy
```

Create and integrity-check the Chrome Web Store upload archive:

```bash
npm run package
```

The packaging script creates `reqkit-v<version>.zip` with `manifest.json` at the archive root. Tests, documentation, source artwork, and store assets are excluded from the upload.

## Support

Report problems or request enhancements through [GitHub Issues](https://github.com/ranjanjharavi/ReqKit/issues).
