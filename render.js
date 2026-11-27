/**
 * Shared rendering for the popup and the results page.
 * Reads the last explanation from chrome.storage.local and renders it.
 */
(function () {
  "use strict";

  var RUDOW_HTML =
    '<div class="rudow"><strong>Want this automatically?</strong> ' +
    "Rudow watches your logs and tells you what broke, in plain English. " +
    '<a href="https://rudow.ai" target="_blank" rel="noopener">rudow.ai</a></div>';

  function el(id) { return document.getElementById(id); }

  function render(result) {
    var out = el("result");
    if (!result) {
      out.innerHTML =
        '<p class="empty">Nothing explained yet. Select some error text on any page, ' +
        "right-click, and choose <strong>Explain this error</strong>.</p>" + RUDOW_HTML;
      el("copy").style.display = "none";
      return;
    }
    var html = "";
    html += '<span class="tag' + (result.viaByok ? " ai" : "") + '">' +
      escapeHtml(result.viaByok ? "Explained with your AI key" : "Offline explanation") + "</span>";
    html += "<h1>" + escapeHtml(result.title || "Explanation") + "</h1>";
    if (result.errorType) {
      html += '<p class="meta">Error: ' + escapeHtml(result.errorType) + "</p>";
    }
    if (result.byokError) {
      html += '<div class="warn">' + escapeHtml(result.byokError) + "</div>";
    }
    if (!result.matched) {
      html += '<div class="warn">No built-in rule matched this error. The breakdown below is a generic starting point.</div>';
    }
    html += "<h2>What it means</h2><p>" + escapeHtml(result.meaning || "") + "</p>";
    if (result.cause) {
      html += "<h2>Likely cause</h2><p>" + escapeHtml(result.cause) + "</p>";
    }
    if (result.next && result.next.length) {
      html += "<h2>What to try next</h2><ol>" +
        result.next.map(function (s) { return "<li>" + escapeHtml(s) + "</li>"; }).join("") +
        "</ol>";
    }
    if (result.keyLine) {
      html += "<h2>Key line</h2><div class=\"keyline\">" + escapeHtml(result.keyLine) + "</div>";
    }
    html += RUDOW_HTML;
    out.innerHTML = html;
    el("copy").style.display = "";
    el("copy").onclick = function () {
      var text = result.plainText || "";
      navigator.clipboard.writeText(text).then(function () {
        el("copy").textContent = "Copied";
        setTimeout(function () { el("copy").textContent = "Copy explanation"; }, 1500);
      });
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  document.addEventListener("DOMContentLoaded", function () {
    chrome.storage.local.get(["lastExplanation"], function (items) {
      render(items.lastExplanation || null);
    });
    // Refresh if a new explanation lands while the page is open.
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes.lastExplanation) {
        render(changes.lastExplanation.newValue || null);
      }
    });
  });
})();
