# ReqKit Privacy Policy

Last updated: August 22, 2026

ReqKit is a Chrome developer utility for applying user-created request headers to exact HTTPS hosts. ReqKit has no analytics, advertising, telemetry, remote code, developer-operated API, or account system.

## Data ReqKit handles

- **Active tab URL:** after you open the popup, ReqKit reads the active tab URL locally to identify the current host. It does not read page content or retain browsing history.
- **Profiles and activation settings:** profile names, the selected profile, pause state, and optional activation timing are stored in `chrome.storage.local` in your Chrome profile.
- **Header rules:** exact HTTPS hosts, header names, header values, profile assignments, and enabled states are stored in `chrome.storage.local` in your Chrome profile.
- **Privacy choice:** acceptance of the first-use disclosure is stored locally.

## How data is used and transmitted

ReqKit sends no data to its developer. While an enabled header rule is active, Chrome sends its configured value only in requests to the exact HTTPS host you approved. Destination services process request headers under their own policies, and those values may appear in destination or intermediary logs.

## Retention and deletion

Profiles, activation settings, header rules, and the privacy choice remain in this Chrome profile until you change or delete them, clear extension data, or uninstall ReqKit. Deleting the last header rule for a host asks Chrome to remove ReqKit's access to that host.

When upgrading from a version that included the URL transformer, ReqKit deletes the previously saved transformer recipe during its local data migration.

## Permissions

- `activeTab` reads only the active tab URL after you invoke ReqKit so it can identify the current hostname.
- `alarms` applies an activation expiry even when no ReqKit page is open.
- `storage` retains the local settings described above.
- `declarativeNetRequestWithHostAccess` applies enabled header rules.
- Optional `https://*/*` host access lets Chrome ask you for a specific exact-site permission when you create or enable a header rule. ReqKit does not receive required access to every website.

## Security and responsible use

ReqKit limits rules to exact HTTPS hosts, masks sensitive-looking header values in the popup, and detects conflicting active header rules. These protections do not prevent you from using data you are authorized to use.

Use ReqKit only with systems and data you are authorized to access. Avoid using long-lived production credentials as test header values.

## Data sharing and sale

ReqKit does not sell or rent user data, and it does not send data to the developer, advertisers, or data brokers. It transmits configured header values only to destinations selected by the user as described above. It does not use data for advertising, creditworthiness, or any purpose unrelated to its user-facing features.

The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For questions or support, open an issue at [github.com/ranjanjharavi/ReqKit](https://github.com/ranjanjharavi/ReqKit/issues).
