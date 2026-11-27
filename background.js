/**
 * Rudow "Explain this error" - service worker.
 *
 * Privacy model:
 * - By default the extension is fully offline. The built-in explainer in
 *   explainer.js runs locally and makes no network requests.
 * - Only when the user has enabled BYOK mode in the options page and saved
 *   their own API key does this file call an external API, and only then
 *   is the selected error text sent anywhere, to the provider the user
 *   chose (OpenAI or Anthropic). The key lives only in chrome.storage.local.
 *
 * No host permissions, no content scripts. The selected text arrives
 * through the context menu's selectionText, so the extension never reads
 * page content by itself.
 */

importScripts("explainer.js");

var CONTEXT_MENU_ID = "rudow-explain-error";
var STORAGE_KEY = "lastExplanation";
var SETTINGS_KEY = "byokSettings";

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Explain this error",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  var selected = (info.selectionText || "").trim();
  handleSelection(selected);
});

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (message && message.type === "explain") {
    handleSelection((message.text || "").trim()).then(function (result) {
      sendResponse({ ok: true, result: result });
    });
    return true; // async reply
  }
  if (message && message.type === "getLast") {
    chrome.storage.local.get([STORAGE_KEY], function (items) {
      sendResponse({ ok: true, result: items[STORAGE_KEY] || null });
    });
    return true;
  }
});

async function handleSelection(selected) {
  var result;
  if (!selected) {
    result = RudowExplainer.explain("");
  } else {
    var settings = await getSettings();
    if (settings.enabled && settings.apiKey && settings.provider) {
      try {
        result = await explainWithProvider(selected, settings);
      } catch (err) {
        // BYOK failed (bad key, no network, provider error). Fall back to
        // the local explainer and say so, instead of showing nothing.
        result = RudowExplainer.explain(selected);
        result.byokError =
          "The AI lookup failed (" + err.message + "), so this is the offline explanation.";
      }
    } else {
      result = RudowExplainer.explain(selected);
    }
  }
  result.sourceText = selected;
  result.explainedAt = new Date().toISOString();
  result.plainText = RudowExplainer.formatPlain(result);
  await chrome.storage.local.set({ [STORAGE_KEY]: result });
  // Open the results page in a new tab so the user sees the explanation
  // right away. The popup shows the same stored result on demand.
  await chrome.tabs.create({ url: chrome.runtime.getURL("results.html") });
  return result;
}

function getSettings() {
  return new Promise(function (resolve) {
    chrome.storage.local.get([SETTINGS_KEY], function (items) {
      var s = items[SETTINGS_KEY] || {};
      resolve({
        enabled: s.enabled === true,
        provider: s.provider === "anthropic" ? "anthropic" : "openai",
        apiKey: typeof s.apiKey === "string" ? s.apiKey : "",
        model: typeof s.model === "string" && s.model ? s.model : "",
      });
    });
  });
}

/**
 * BYOK path. This is the ONLY place in the extension that makes a network
 * request. It runs only when the user turned BYOK on and saved a key.
 * Only the selected error text is sent, as part of a short prompt.
 */
async function explainWithProvider(selected, settings) {
  var prompt =
    "Explain this error in plain English for a developer. " +
    "Give three short sections: What it means, Likely cause, What to try next (numbered steps). " +
    "Keep it direct and concrete. No em dashes.\n\nError:\n" +
    selected.slice(0, 6000);

  var text;
  if (settings.provider === "anthropic") {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model || "claude-haiku-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("Anthropic returned HTTP " + res.status);
    var data = await res.json();
    text = (data.content || [])
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("\n");
  } else {
    var res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res2.ok) throw new Error("OpenAI returned HTTP " + res2.status);
    var data2 = await res2.json();
    text = (data2.choices && data2.choices[0] && data2.choices[0].message && data2.choices[0].message.content) || "";
  }

  if (!text) throw new Error("empty response from provider");
  return parseProviderReply(text, selected);
}

function parseProviderReply(text, selected) {
  // Best-effort split of the provider reply into the three sections.
  function section(name, fallback) {
    var re = new RegExp(name + "\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:Likely cause|What to try next|What it means)\\s*:|\\s*$)", "i");
    var m = text.match(re);
    return m ? m[1].trim() : fallback;
  }
  var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  var steps = lines
    .filter(function (l) { return /^\d+[.)]\s/.test(l); })
    .map(function (l) { return l.replace(/^\d+[.)]\s*/, ""); });
  var local = RudowExplainer.explain(selected);
  return {
    matched: true,
    family: local.family === "Unknown error" ? "AI explanation" : local.family,
    title: local.family === "Unknown error" ? "AI explanation" : local.family,
    meaning: section("What it means", text),
    cause: section("Likely cause", ""),
    next: steps.length ? steps : [text],
    errorType: local.errorType,
    keyLine: local.keyLine,
    viaByok: true,
  };
}
