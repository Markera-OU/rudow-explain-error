/**
 * Unit tests for the local explainer.
 * Run: node --test test/explainer.test.js
 * Zero dependencies, uses the Node test runner.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { explain, formatPlain, ruleCount } = require("../explainer.js");

function expectFamily(t, sample, family) {
  test(t, () => {
    const r = explain(sample);
    assert.equal(r.matched, true, "expected a rule to match for: " + t);
    assert.equal(r.family, family);
    assert.ok(r.meaning && r.meaning.length > 20, "meaning should be a real sentence");
    assert.ok(r.cause && r.cause.length > 20, "cause should be a real sentence");
    assert.ok(Array.isArray(r.next) && r.next.length >= 2, "next steps should be a list");
    assert.ok(r.keyLine, "key line should be extracted");
    const plain = formatPlain(r);
    assert.ok(plain.includes(r.title), "plain text should include the title");
  });
}

// ---------- JavaScript ----------
expectFamily(
  "JS TypeError: cannot read properties of undefined",
  "TypeError: Cannot read properties of undefined (reading 'name')\n    at renderUser (app.js:42:19)",
  "JavaScript TypeError"
);
expectFamily(
  "JS TypeError: is not a function",
  "TypeError: handleClick is not a function\n    at HTMLButtonElement.onclick (index.html:12:1)",
  "JavaScript TypeError"
);
expectFamily(
  "JS ReferenceError",
  "ReferenceError: config is not defined\n    at init (app.js:5:3)",
  "JavaScript ReferenceError"
);
expectFamily(
  "JS SyntaxError",
  "SyntaxError: Unexpected token ';'",
  "JavaScript SyntaxError"
);
expectFamily(
  "JS RangeError: max call stack",
  "RangeError: Maximum call stack size exceeded\n    at loop (app.js:9:3)",
  "JavaScript RangeError"
);
expectFamily(
  "JS unhandled promise rejection",
  "UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block",
  "JavaScript Promise"
);

// ---------- Python ----------
expectFamily(
  "Python KeyError",
  "Traceback (most recent call last):\n  File \"app.py\", line 27, in get_user\n    return users[user_id]\nKeyError: 'user_4821'",
  "Python KeyError"
);
expectFamily(
  "Python IndexError",
  "Traceback (most recent call last):\n  File \"app.py\", line 10, in <module>\n    print(items[5])\nIndexError: list index out of range",
  "Python IndexError"
);
expectFamily(
  "Python AttributeError on None",
  "AttributeError: 'NoneType' object has no attribute 'split'",
  "Python AttributeError"
);
expectFamily(
  "Python ModuleNotFoundError",
  "Traceback (most recent call last):\n  File \"app.py\", line 1, in <module>\n    import requests\nModuleNotFoundError: No module named 'requests'",
  "Python ImportError"
);
expectFamily(
  "Python ValueError",
  "ValueError: invalid literal for int() with base 10: 'abc'",
  "Python ValueError"
);
expectFamily(
  "Python TypeError",
  "TypeError: unsupported operand type(s) for +: 'int' and 'str'",
  "Python TypeError"
);
expectFamily(
  "Python ZeroDivisionError",
  "ZeroDivisionError: division by zero",
  "Python ZeroDivisionError"
);

// ---------- Node.js ----------
expectFamily(
  "Node ENOENT",
  "Error: ENOENT: no such file or directory, open './config.json'",
  "Node.js ENOENT"
);
expectFamily(
  "Node EADDRINUSE",
  "Error: listen EADDRINUSE: address already in use :::3000",
  "Node.js EADDRINUSE"
);
expectFamily(
  "Node MODULE_NOT_FOUND",
  "Error: Cannot find module 'express'\nRequire stack:\n- /app/server.js",
  "Node.js MODULE_NOT_FOUND"
);

// ---------- HTTP ----------
expectFamily("HTTP 400", "Request failed with status code 400: Bad Request", "HTTP 400 Bad Request");
expectFamily("HTTP 401", "Request failed with status code 401: Unauthorized", "HTTP 401 Unauthorized");
expectFamily("HTTP 403", "403 Forbidden: You don't have permission to access this resource", "HTTP 403 Forbidden");
expectFamily("HTTP 404", "404 Not Found: The requested URL /v1/users/99 was not found on this server", "HTTP 404 Not Found");
expectFamily("HTTP 429", "429 Too Many Requests: rate limit exceeded", "HTTP 429 Too Many Requests");
expectFamily("HTTP 500", "500 Internal Server Error", "HTTP 500 Internal Server Error");
expectFamily("HTTP 502", "502 Bad Gateway: nginx", "HTTP 502 Bad Gateway");
expectFamily("HTTP 503", "503 Service Unavailable: The server is temporarily unable to service your request", "HTTP 503 Service Unavailable");

// ---------- Infrastructure ----------
expectFamily(
  "Database connection refused",
  "Error: connect ECONNREFUSED 127.0.0.1:5432\nPostgres connection failed: could not connect to server: Connection refused",
  "Database connection error"
);
expectFamily(
  "CORS",
  "Access to fetch at 'https://api.example.com/data' from origin 'https://app.example.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.",
  "CORS error"
);
expectFamily(
  "DNS ENOTFOUND",
  "Error: getaddrinfo ENOTFOUND api.example.com",
  "DNS error"
);
expectFamily(
  "TLS certificate expired",
  "Error: certificate has expired\n    at TLSSocket.onConnectSecure (node:_tls_wrap:1678:34)",
  "TLS / certificate error"
);
expectFamily(
  "Out of memory",
  "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
  "Out of memory"
);
expectFamily(
  "JSON parse error",
  "SyntaxError: Unexpected token '<', \"<html>...\" is not valid JSON",
  "JSON parse error"
);

// ---------- Fallbacks ----------
test("unknown error says so plainly and still gives a generic breakdown", () => {
  const r = explain("FROBNICATOR-9000: wobble factor exceeded in sector 7");
  assert.equal(r.matched, false);
  assert.equal(r.family, "Unknown error");
  assert.ok(r.meaning.includes("does not match any pattern"));
  assert.ok(r.next.length >= 2);
  assert.ok(r.keyLine.includes("FROBNICATOR"));
});

test("empty input reports no text selected", () => {
  const r = explain("   \n  ");
  assert.equal(r.matched, false);
  assert.equal(r.family, "No error text");
  assert.ok(r.next[0].includes("Select the error text"));
});

test("BYOK off means zero network requests: fetch exists only inside explainWithProvider, gated on settings", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  // Every fetch call must be inside the explainWithProvider function body.
  const fnStart = src.indexOf("async function explainWithProvider");
  const fnEnd = src.indexOf("\nfunction parseProviderReply");
  assert.ok(fnStart > -1 && fnEnd > fnStart, "explainWithProvider must exist");
  const fnBody = src.slice(fnStart, fnEnd);
  const fetchCalls = src.match(/fetch\(/g) || [];
  const fetchInFn = fnBody.match(/fetch\(/g) || [];
  assert.ok(fetchCalls.length > 0, "BYOK provider calls should exist");
  assert.equal(fetchInFn.length, fetchCalls.length, "no fetch call may live outside explainWithProvider");
  // The only call site must be gated on the user having enabled BYOK and saved a key.
  assert.ok(
    src.includes("if (settings.enabled && settings.apiKey && settings.provider)"),
    "BYOK call site must be gated on enabled + key + provider"
  );
  // No other network API anywhere in the extension source (excluding tests).
  const extDir = path.join(__dirname, "..");
  const jsFiles = ["background.js", "explainer.js", "render.js", "options.js"];
  for (const f of jsFiles) {
    const s = fs.readFileSync(path.join(extDir, f), "utf8");
    assert.ok(!/XMLHttpRequest|WebSocket|sendBeacon/.test(s), f + " must not use other network APIs");
  }
});

test("rule count covers the documented families", () => {
  assert.ok(ruleCount >= 28, "expected at least 28 rules, got " + ruleCount);
});

test("explanation copy has no em dashes", () => {
  const samples = [
    "TypeError: Cannot read properties of undefined (reading 'x')",
    "KeyError: 'missing'",
    "Error: listen EADDRINUSE: address already in use :::3000",
    "500 Internal Server Error",
    "some totally unknown failure text",
  ];
  for (const s of samples) {
    const plain = formatPlain(explain(s));
    assert.ok(!plain.includes("—"), "em dash found in explanation for: " + s);
  }
});
