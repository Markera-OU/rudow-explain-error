# Rudow Explain this error

A free, standalone Chrome extension. Select any error text on any page (a stack trace, a Sentry page, a GitHub issue, a terminal paste), right-click **Explain this error**, and get a plain English explanation: what it means, the likely cause, and what to try next.

No Rudow account required. No sign up. By default it works fully offline.

## Install (Load unpacked)

1. Download or clone this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. The extension icon appears in the toolbar. Right-click any selected error text and choose **Explain this error**.

## Usage

1. Select error text on any page.
2. Right-click and choose **Explain this error**.
3. A results tab opens with the explanation. The toolbar popup shows the same result later.
4. Use **Copy explanation** to copy the plain text version.

If nothing is selected, the extension says so and asks you to select the error text first. If the error matches no known pattern, it says so plainly and gives a generic breakdown instead: the error type, the key line, and what to check first.

Try it on the included fixture page: open `examples/error-page.html` in Chrome and select one of the error blocks.

## Privacy: what leaves your machine

**By default, nothing leaves your machine at all.**

The extension has no host permissions and no content scripts. It never reads page content by itself. The only text it ever sees is the text you select and right-click on, which arrives through the context menu. The built-in explainer runs locally in the extension and makes no network requests.

**Optional BYOK mode (off by default)** is the only exception. In the Options page you can paste your own API key (OpenAI or Anthropic) and turn AI mode on. Only then, and only for the error text you selected, the extension sends that selected text to the provider you chose, so their model can explain it. Your key is stored only in `chrome.storage.local` on your machine. Turn AI mode off or remove the key at any time to go back to fully offline.

In short:

| Mode | What is sent | Where |
| --- | --- | --- |
| Default (offline) | Nothing | Nowhere |
| BYOK on | Only the selected error text | OpenAI or Anthropic, your choice |

No analytics, no tracking, no account, no error text stored anywhere except the last explanation kept locally so the popup can show it.

## Error families covered (offline)

The built-in local explainer covers these families. Each one has at least one unit test with a real sample error.

- JavaScript: TypeError (undefined/null access, not a function), ReferenceError, SyntaxError, RangeError (max call stack), unhandled promise rejection, JSON parse errors
- Python: KeyError, IndexError, AttributeError, ImportError / ModuleNotFoundError, ValueError, TypeError, ZeroDivisionError
- Node.js: ENOENT (file not found), EADDRINUSE (port in use), MODULE_NOT_FOUND
- HTTP status codes: 400, 401, 403, 404, 429, 500, 502, 503
- Infrastructure: database connection errors, CORS, DNS, TLS/certificate errors, out of memory

## How BYOK works

1. Open the extension Options page.
2. Tick the AI mode checkbox, pick OpenAI or Anthropic, and paste your own API key.
3. Optionally set a model (defaults: `gpt-4o-mini` for OpenAI, `claude-haiku-4-5` for Anthropic).
4. Save.

From then on, explanations for selected text use your chosen provider. If the AI lookup fails (bad key, no network, provider error), the extension falls back to the offline explainer and says so in the result. The key is never sent anywhere except to the provider you chose, together with the selected error text.

## The Rudow hook

The results view and the popup carry a short section: "Want this automatically? Rudow watches your logs and tells you what broke, in plain English" with a link to [rudow.ai](https://rudow.ai). That is the whole pitch. No nagging, no account prompts, no popups asking you to sign up.

## Development

Zero dependencies. Tests use the Node test runner.

```bash
npm test
```

The explainer lives in `explainer.js` and is written as a small UMD module so the same file runs in the extension service worker and under Node for tests. To add a new error family, add a rule to the `RULES` list in `explainer.js` with a test in `test/explainer.test.js`.

## Files

- `manifest.json` - Manifest V3. Permissions are exactly `contextMenus` and `storage`. No host permissions, no content scripts.
- `background.js` - Service worker. Creates the context menu, runs the local explainer, and holds the only network code in the extension (the BYOK provider calls).
- `explainer.js` - The offline rule-based explainer.
- `popup.html`, `results.html`, `render.js` - The popup and the results tab.
- `options.html`, `options.js` - Options page with the BYOK settings.
- `styles.css` - Shared styles.
- `icons/` - Extension icons.
- `examples/error-page.html` - Fixture page with realistic errors to try the extension on.
- `test/explainer.test.js` - Unit tests.

## License

MIT. Built by Markera.
