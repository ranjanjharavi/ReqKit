# ReqKit

ReqKit is a lightweight Chrome developer extension for transforming URLs with one saved recipe and applying request headers to user-approved HTTPS hosts.

## Features

### URL transformer

- Prefills the active tab URL while keeping it editable.
- Stores one editable default recipe in the current Chrome profile.
- Adds any number of independently enabled query parameters.
- Replaces existing values when the source URL already contains the same query key.
- Optionally captures the original path, query, and fragment in a configured query parameter.
- Copies the transformed URL or opens it in a new tab.
- Rejects duplicate keys, empty keys, empty values, embedded URL credentials, and unsupported protocols.
- Requires HTTPS, except for local development on `localhost`, `127.0.0.1`, and `[::1]`.
- Warns when query data looks sensitive because URLs may appear in browser, proxy, and server logs.

The initial recipe enables these editable parameters:

```text
disableCustomJs=true
disableCustomCss=true
```

These flags only affect applications that implement them.

#### Standard transformation

With path capture disabled, ReqKit preserves the source path, existing query parameters, and fragment while merging the enabled recipe parameters.

```text
Source:
https://example.com/app?view=list#details

Result:
https://example.com/app?view=list&disableCustomJs=true&disableCustomCss=true#details
```

#### Path capture

With path capture enabled using the key `redirect`, ReqKit moves the original path, query, and fragment into that query value and builds the result at the source origin root.

```text
Source:
https://example.com/app?view=list#details

Result:
https://example.com/?redirect=/app%3Fview%3Dlist%23details&disableCustomJs=true&disableCustomCss=true
```

### Request headers

- Creates request-header rules for exact HTTPS hostnames.
- Requests optional site access only when a rule is created or enabled.
- Supports enabling, pausing, editing, and deleting rules.
- Applies enabled rules through Chrome's `declarativeNetRequest` API.
- Detects conflicting active rules for the same host and header name.
- Masks sensitive-looking header values in the popup until explicitly revealed.
- Removes site access after the final rule for a hostname is deleted.

Use header modification only with systems you are authorized to test.

### Profiles

Rules are grouped into profiles, and one profile is active at a time. Rules in the other
profiles keep their own on/off state and are simply not applied, so the same header can hold
a different value in each environment without the two ever colliding.

- The popup shows a profile switcher once a second profile exists, and only lists rules from
  the profile in play.
- The rule manager creates, renames, duplicates and deletes profiles, and its edit form moves
  a rule between them.
- Duplicating a profile copies its rules paused, so nothing goes live by accident.
- Deleting a profile never deletes rules. They move to Default and are paused.
- Switching to a profile asks for any site access it still needs, in one prompt. If you
  decline, the switch still happens and the affected rules are flagged with a Grant button
  rather than silently doing nothing.

### Auto-off timer

Rules can be set to apply for **1 hour**, **8 hours**, **until Chrome closes**, or until you
turn them off. When the time is up ReqKit parks the active profile: every rule stops being
applied, but nothing is edited or deleted, so resuming is one click.

The timer belongs to the activation rather than to a profile — switching profiles disarms it
and choosing a duration arms a fresh one. The remaining time is shown rounded, and the
timer runs on a Chrome alarm rather than a check that only happens when you open the popup.

### Pausing everything

A single switch pauses every header rule without deleting anything or changing any rule's
own on/off state. Resuming restores exactly what was there before.

While rules are paused the toolbar badge reads `off`, and both the popup and the rule
manager show a banner. The badge stays blank when there was nothing to apply anyway.

The badge otherwise counts the rules active on the site you are looking at, falling back to
the profile-wide count on pages whose address ReqKit has no access to read.

### Popup and rule manager

The popup answers one question: what ReqKit is doing to the current site. It lists that
host's rules, adds new ones, and links to the rule manager.

The rule manager is a full page, opened from the popup or from **Extension options** in
`chrome://extensions`. It holds everything that is not about the current tab: all hosts
grouped and searchable, and the rule create and edit forms.

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
| `activeTab` | Reads the invoked active tab URL to prefill the transformer and identify the current hostname. It does not read page content or general browsing history. |
| `alarms` | Fires the auto-off timer so rules stop applying when the time is up, even if no ReqKit page is open. |
| `storage` | Stores privacy consent, the default URL recipe, and header rules locally in the current Chrome profile. |
| `declarativeNetRequestWithHostAccess` | Applies enabled request-header rules without injecting scripts or reading response bodies. |
| Optional `https://*/*` host access | Allows Chrome to prompt for a user-selected exact HTTPS hostname. ReqKit does not receive required access to every site. |

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
