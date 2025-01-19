# Chrome Web Store submission — ReqKit

Last updated: 2026-08-09

## Store listing

**Name:** ReqKit

**GitHub repository description:** Transform active-tab URLs with one saved recipe and manage exact-site request headers from Chrome.

**Short description:** Transform URLs with a saved recipe and manage exact-site request headers.

**Detailed description**

ReqKit is a compact developer utility for configuring test requests to web systems you are authorized to use. It combines a saved URL-transformation recipe and exact-host request-header rules in one Chrome toolbar popup.

Features:

- Active-tab URL transformer: the current tab URL is prefilled and remains editable. HTTPS is required except for explicit local-development URLs on localhost or loopback addresses.
- One saved default recipe: independently enable any number of query parameters, edit their keys and values, or reset the recipe to its defaults.
- Optional path capture: move the source path, query, and fragment into a query parameter, then add the recipe's enabled parameters.
- Explicit controls: query names and values are stored only when you click **Save**; enable switches persist immediately. Sensitive-looking query data shows a logging warning without blocking the requested transformation.
- Exact-site header rules: create a header rule only for an exact HTTPS host. ReqKit requests Chrome site access when you add or enable that rule, detects active conflicts, masks sensitive-looking values, and releases unneeded access after the final rule is removed.
- Local processing: ReqKit has no analytics, ads, telemetry, remote code, developer-operated server, or account system.

ReqKit reads the active tab URL locally after first-use consent. The default URL recipe and header rules remain in `chrome.storage.local` in the user's Chrome profile. A transformed URL is transmitted only when the user chooses to use it. Enabled header values are sent only to their approved exact HTTPS hosts. Query strings and request headers may be logged by destination services or network infrastructure.

Use ReqKit only with systems and data you are authorized to access.

Support: https://github.com/ranjanjharavi/ReqKit/issues

Privacy policy: https://ranjanjharavi.github.io/ReqKit/privacy-policy.html

**Category:** Developer Tools

**Single purpose:** Configure developer test requests by composing URL query transformations and exact-site request headers.

**Primary language:** English

## Graphics and assets

| Asset | Required size | Status | Repository file |
|---|---:|---|---|
| Store icon | 128×128 PNG | Ready | `extension/icons/reqkit-128.png` |
| Screenshot 1 | 1280×800 PNG | Ready | `store-assets/reqkit-screenshot-1280x800.png` |
| Screenshot 2 | 1280×800 PNG | Ready | `store-assets/reqkit-output-screenshot-1280x800.png` |
| Screenshot 3 | 1280×800 PNG | Ready; visually recheck | `store-assets/reqkit-headers-screenshot-1280x800.png` |
| Small promo tile | 440×280 PNG | Ready; visually recheck | `store-assets/reqkit-promo-440x280.png` |

Use demonstration values only. Do not include real credentials or private hostnames in store artwork.

## Permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | After the user opens the popup and accepts the disclosure, reads only that active tab's URL to prefill the transformer and current-host rule view. ReqKit does not read page content or general browser history. |
| `declarativeNetRequestWithHostAccess` | Applies user-created `modifyHeaders` rules to outgoing requests. Every rule is limited by a regular expression to the exact HTTPS hostname entered by the user. ReqKit does not block requests, inject scripts, or inspect response bodies. |
| `storage` | Stores privacy-consent state, one default URL recipe, and exact-host header rules in `chrome.storage.local`. ReqKit does not use sync or session storage. |
| Optional host access `https://*/*` | Allows Chrome to offer an on-demand permission prompt for a user-selected HTTPS host. ReqKit requests only `https://the-exact-host/*` when needed and removes that access after the last rule for that host is deleted. There is no required `<all_urls>` access. |

## Privacy practices answers

Chrome policy requires disclosure even when user data is processed or stored only on the device. Answer **Yes** when the dashboard asks whether ReqKit handles user data, and keep the dashboard, listing, first-use disclosure, and privacy policy consistent.

| Dashboard data type | Answer | Handling and purpose |
|---|---|---|
| Web history | Yes, limited | The invoked popup reads only the active tab URL in memory to prefill the URL and host fields. It does not retain browsing history. |
| Authentication information | Yes, possible | Users can intentionally enter authentication-like query or header values. Recipe and header values are stored locally and sent only when the user transforms/uses a URL or enables a rule for an approved destination. ReqKit warns about query logging and masks sensitive-looking header values. |
| Website content / user-provided content | Yes, limited | Query recipe fields and request-header configuration are user-provided and stored locally to perform the visible features. |
| Personally identifiable, financial, health, location, personal communications | No | ReqKit does not request or require these data types. Users should not place unrelated personal data in recipe or header fields. |

Certify in the dashboard that:

- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to ReqKit's single purpose.
- Data is not used or transferred for creditworthiness or lending.
- ReqKit provides no developer or human access to the data and has no developer backend.
- Information received from Google APIs is handled according to the Chrome Web Store User Data Policy, including Limited Use requirements.

Official policy references: [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Privacy Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy), and [Minimum Permission](https://developer.chrome.com/docs/webstore/program-policies/permissions).

## URLs and developer information

- Privacy policy: https://ranjanjharavi.github.io/ReqKit/privacy-policy.html
- Support: https://github.com/ranjanjharavi/ReqKit/issues
- Homepage: https://github.com/ranjanjharavi/ReqKit
- Publisher name: Ravi Ranjan
- Contact email: use the verified email shown in the Chrome Web Store developer account
- Visibility: Public
- Regions: All regions
- Pricing: Free

Before submitting, publish the repository and enable GitHub Pages from `/docs`. Verify the privacy URL, homepage, and support URL in a signed-out browser. The public URLs returned HTTP 404 during the 2026-08-09 preflight and remain submission blockers until they return HTTP 200.

## Reviewer instructions

No account, payment, private site, or real credential is required.

1. Install ReqKit, open the toolbar popup, review the disclosure, and click **Accept and continue**.
2. On **URL transform**, enter `https://example.com/app?view=list#details` and click **Transform**. Confirm the default recipe preserves the path and adds `disableCustomJs=true` and `disableCustomCss=true`.
3. Edit the default recipe, enable path capture with key `redirect`, add `mode=qa`, save, and transform again. Confirm the output begins at `https://example.com/` and places the original path, query, and fragment in the `redirect` query value.
4. On **Headers**, add a rule for `https://httpbin.org/headers` with name `X-ReqKit-Review` and value `enabled`. Approve Chrome's prompt for `https://httpbin.org/*`.
5. Open or refresh `https://httpbin.org/headers` and confirm the demonstration header is present in the JSON response.
6. Pause the rule and refresh to confirm it is no longer applied. Delete the rule to release the exact-site permission.

The custom-code query flags are meaningful only to applications that implement them; the output string itself is sufficient to review the transformation.

## Release record

| Version | Date | Changes | Status |
|---|---|---|---|
| 1.0 | 2026-08-09 | Initial release with one saved URL recipe and exact-site HTTPS header rules | Ready after final UI capture and public-URL checks |
