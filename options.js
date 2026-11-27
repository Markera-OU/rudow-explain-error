/**
 * Options page for BYOK settings.
 * The key is stored only in chrome.storage.local and never leaves the
 * machine except in a request to the provider the user chose, and only
 * when BYOK is enabled.
 */
(function () {
  "use strict";

  var KEY = "byokSettings";

  function $(id) { return document.getElementById(id); }

  function load() {
    chrome.storage.local.get([KEY], function (items) {
      var s = items[KEY] || {};
      $("enabled").checked = s.enabled === true;
      $("provider").value = s.provider === "anthropic" ? "anthropic" : "openai";
      $("apiKey").value = typeof s.apiKey === "string" ? s.apiKey : "";
      $("model").value = typeof s.model === "string" ? s.model : "";
    });
  }

  function save() {
    var settings = {
      enabled: $("enabled").checked,
      provider: $("provider").value,
      apiKey: $("apiKey").value.trim(),
      model: $("model").value.trim(),
    };
    if (settings.enabled && !settings.apiKey) {
      $("status").textContent = "Add an API key first, or turn AI mode off.";
      return;
    }
    chrome.storage.local.set({ [KEY]: settings }, function () {
      $("status").textContent = settings.enabled
        ? "Saved. AI mode is on: only the error text you select will be sent to " +
          (settings.provider === "anthropic" ? "Anthropic" : "OpenAI") + "."
        : "Saved. AI mode is off. Nothing leaves your machine.";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    load();
    $("save").addEventListener("click", save);
    $("clearKey").addEventListener("click", function () {
      $("apiKey").value = "";
      $("enabled").checked = false;
      save();
    });
  });
})();
