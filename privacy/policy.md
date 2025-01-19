# ReqKit Privacy Policy

Last updated: August 9, 2026

ReqKit is a Chrome developer utility for transforming URLs and applying user-created request headers to exact HTTPS hosts. ReqKit has no analytics, advertising, telemetry, remote code, developer-operated API, or account system.

## Data ReqKit handles

- **Active tab URL:** after you open the popup, ReqKit reads the active tab URL locally to prefill the transformer and identify the current host. It does not read page content or retain browsing history.
- **Default URL recipe:** path-capture settings, query keys, query values, and parameter states are stored in `chrome.storage.local` in your Chrome profile.
- **Header rules:** exact HTTPS hosts, header names, header values, and enabled states are stored in `chrome.storage.local` in your Chrome profile.
- **Privacy choice:** acceptance of the first-use disclosure is stored locally.

## How data is used and transmitted

ReqKit sends no data to its developer. A transformed URL is built locally and is transmitted only if you choose to copy, open, or otherwise use it. Query values can appear in browser history and in destination, proxy, or server logs.

While an enabled header rule is active, Chrome sends its configured value only in requests to the exact HTTPS host you approved. Destination services process URLs and request headers under their own policies.

## Retention and deletion

The default URL recipe and header rules remain in this Chrome profile until you reset or delete them, clear extension data, or uninstall ReqKit. Deleting the last header rule for a host asks Chrome to remove ReqKit's access to that host.

## Permissions

- `activeTab` reads only the active tab URL after you invoke ReqKit.
- `storage` retains the local settings described above.
- `declarativeNetRequestWithHostAccess` applies enabled header rules.
- Optional `https://*/*` host access lets Chrome ask you for a specific exact-site permission when you create or enable a header rule. ReqKit does not receive required access to every website.

## Security and responsible use

ReqKit requires HTTPS except for explicit local-development URLs on `localhost`, `127.0.0.1`, or `[::1]`. It rejects URLs containing embedded usernames or passwords, flags sensitive-looking query data, masks sensitive-looking header values, and detects conflicting active header rules. Warnings do not prevent you from using data you are authorized to use.

Use ReqKit only with systems and data you are authorized to access. Avoid placing long-lived credentials in URLs because URLs are commonly logged.

## Data sharing and sale

ReqKit does not sell or rent user data, and it does not send data to the developer, advertisers, or data brokers. It transmits data only to destinations selected by the user as described above. It does not use data for advertising, creditworthiness, or any purpose unrelated to its user-facing features.

The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For questions or support, open an issue at [github.com/ranjanjharavi/ReqKit](https://github.com/ranjanjharavi/ReqKit/issues).
