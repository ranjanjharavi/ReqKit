# ReqKit Privacy Policy

Last updated: August 23, 2026

ReqKit is a Chrome extension for creating, organizing, and temporarily applying user-created request-header rules to exact HTTPS hosts. It is built for API and web-environment testing. ReqKit has no analytics, advertising, telemetry, remote code, developer-operated API, or account system.

## Data ReqKit handles

- **Active tab URL:** after you open the popup, ReqKit reads the active tab URL locally to identify the current host. It does not read page content or retain browsing history.
- **Profiles and activation settings:** profile names, the selected profile, pause state, and optional activation timing are stored in `chrome.storage.local` in your Chrome profile.
- **Header rules:** exact HTTPS hosts, header names, header values, profile assignments, and enabled states are stored in `chrome.storage.local` in your Chrome profile.
- **Privacy choice:** acceptance of the first-use disclosure is stored locally.

## How data is used and transmitted

ReqKit sends no data to its developer. While an enabled header rule is active, Chrome sends its configured value only in requests to the exact HTTPS host you approved. Destination services process request headers under their own policies, and those values may appear in destination or intermediary logs.

## Retention and deletion

Profiles, activation settings, header rules, and the privacy choice remain in this Chrome profile until you change or delete them, clear extension data, or uninstall ReqKit. Deleting a profile also deletes the header rules assigned to it. Deleting the last header rule for a host asks Chrome to remove ReqKit's access to that host.

## Permissions

- `activeTab` reads the active tab URL locally only after you open ReqKit, so the popup can identify the current hostname and show matching rules. It does not read page content or general browsing history.
- `alarms` runs the user-selected automatic expiry so active request-header rules stop applying even when no ReqKit page is open.
- `storage` retains privacy consent, profiles, activation settings, and request-header rules locally in the current Chrome profile.
- `declarativeNetRequestWithHostAccess` applies user-created request-header rules to approved HTTPS hosts without injecting scripts or reading response bodies.
- Optional `https://*/*` host access lets ReqKit ask Chrome for access to the exact HTTPS host you choose when creating or enabling a rule. This optional pattern enables exact-host prompts; it does not grant ReqKit required access to every website.

## Security and responsible use

ReqKit limits rules to exact HTTPS hosts, masks sensitive-looking header values in the popup, and detects conflicting active header rules. These protections do not prevent you from using data you are authorized to use.

Use ReqKit only with systems and data you are authorized to access. Avoid using long-lived production credentials as test header values.

## Data sharing and sale

ReqKit does not sell or rent user data, and it does not send data to the developer, advertisers, or data brokers. It transmits configured header values only to destinations selected by the user as described above. It does not use data for advertising, creditworthiness, or any purpose unrelated to its user-facing features.

The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For questions or support, open an issue at [github.com/ranjanjharavi/ReqKit](https://github.com/ranjanjharavi/ReqKit/issues).
