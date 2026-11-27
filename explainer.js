/**
 * Rudow "Explain this error" - local rule-based explainer.
 *
 * This module is fully offline. It takes error text and returns a plain
 * English explanation: what it means, the likely cause, and what to try
 * next. It makes no network requests and reads no files.
 *
 * It is written as a small UMD module so the same file can be loaded by
 * the extension service worker (browser global) and by the Node test
 * runner (CommonJS).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RudowExplainer = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Each rule: a name, one or more matchers, and the explanation.
  // `meaning` says what the error is. `cause` says the most likely reason.
  // `next` is a short list of concrete things to try, in order.
  var RULES = [
    // ---------- JavaScript ----------
    {
      id: "js-typeerror-undefined",
      family: "JavaScript TypeError",
      patterns: [
        /cannot read propert(?:y|ies) of undefined/i,
        /cannot read propert(?:y|ies) of null/i,
        /cannot read properties of undefined/i,
        /cannot read properties of null/i,
        /undefined is not an object/i,
        /null is not an object/i,
        /cannot set propert(?:y|ies) of undefined/i,
        /cannot set propert(?:y|ies) of null/i,
      ],
      meaning:
        "Your code tried to use a property (like .name or .length) on something that does not exist yet. The value was undefined or null, so there was nothing to read from.",
      cause:
        "Usually a variable was never assigned, a function returned nothing, data from an API or a form arrived empty, or code ran before the data it needs had loaded.",
      next: [
        "Find the line in the stack trace and check which value is undefined or null at that point.",
        "Add a guard before the line, for example: if (thing) { ... } or use optional chaining (thing?.name).",
        "Check where the value comes from. If it is API data, log the response to see what actually arrived.",
      ],
    },
    {
      id: "js-typeerror-not-function",
      family: "JavaScript TypeError",
      patterns: [
        /is not a function/i,
        /is not a constructor/i,
        /is not iterable/i,
      ],
      meaning:
        "Your code tried to call something as a function, or loop over it, but the value is not a function (or not iterable).",
      cause:
        "Usually a wrong import (default import vs named import), a misspelled function name, or a variable that holds a value instead of a function.",
      next: [
        "Check the import of the thing being called. A default import and a named import are not interchangeable.",
        "Log the value right before the call to see what it actually is.",
        "Check for a typo in the function name.",
      ],
    },
    {
      id: "js-referenceerror",
      family: "JavaScript ReferenceError",
      patterns: [/referenceerror/i, /is not defined/i],
      meaning:
        "Your code uses a variable or function name that does not exist in that scope. JavaScript has no value to look up, so it stops.",
      cause:
        "Usually a typo, a missing import, a variable used outside the block where it was declared, or a script that loaded in the wrong order.",
      next: [
        "Check the spelling of the name on the reported line.",
        "Check that the variable is imported or declared before it is used.",
        "If it comes from another script file, check the script loads before this code runs.",
      ],
    },
    {
      id: "json-parse",
      family: "JSON parse error",
      patterns: [/unexpected token .* in json/i, /json.*parse/i, /is not valid json/i],
      meaning:
        "The code tried to read text as JSON and the text is not valid JSON.",
      cause:
        "Usually the server returned an HTML error page instead of JSON, or the JSON has a trailing comma or unquoted key.",
      next: [
        "Log the raw text before parsing it. It is probably an HTML error page, not JSON.",
        "Check the response status first. Parse the body as JSON only on success.",
        "Validate the JSON with a linter to find the bad character.",
      ],
    },
    {
      id: "js-syntaxerror",
      family: "JavaScript SyntaxError",
      patterns: [/syntaxerror/i, /unexpected token/i, /unexpected end of input/i, /unexpected identifier/i, /missing \) after argument list/i],
      meaning:
        "The JavaScript engine could not read your code because it is not valid syntax. The file never ran at all.",
      cause:
        "Usually a missing or extra bracket, brace, parenthesis or comma, a stray character, or a string that was never closed.",
      next: [
        "Look at the line and column the error reports. The real mistake is often just before that point.",
        "Check brackets and braces balance out in the surrounding function.",
        "If the error points at JSON, the JSON is malformed. Validate it with a JSON linter.",
      ],
    },
    {
      id: "js-rangeerror-stack",
      family: "JavaScript RangeError",
      patterns: [
        /maximum call stack size exceeded/i,
        /too much recursion/i,
        /rangeerror/i,
      ],
      meaning:
        "A function kept calling itself (or calling functions in a loop) until the call stack ran out of room. The browser or Node stopped it to avoid crashing.",
      cause:
        "Almost always infinite recursion: a function that calls itself without a working stop condition, or two functions that call each other forever.",
      next: [
        "Find the function that repeats in the stack trace and check its base case.",
        "Check the condition that is supposed to stop the recursion. It is probably never true.",
        "If the recursion is intentional, rewrite it as a loop or add a depth limit.",
      ],
    },
    {
      id: "js-promise-rejection",
      family: "JavaScript Promise",
      patterns: [/unhandled promise rejection/i, /uncaught \(in promise\)/i],
      meaning:
        "A promise failed (a request or async job errored) and nothing caught the failure, so it surfaced as an unhandled rejection.",
      cause:
        "Usually a missing .catch() or try/catch around an await, or an async function that throws and nobody handles the result.",
      next: [
        "Wrap the awaited call in try/catch, or add .catch() to the promise chain.",
        "Read the rejection reason in the error text. That is the real error underneath.",
        "Fix the underlying failure, not just the warning. The rejection is a symptom.",
      ],
    },
    // ---------- Python ----------
    {
      id: "py-keyerror",
      family: "Python KeyError",
      patterns: [/keyerror/i],
      meaning:
        "Your code asked a dictionary for a key that is not in it, for example data['user'] when 'user' is missing.",
      cause:
        "Usually the data is shaped differently than expected, a field is optional and absent, or a key name is misspelled.",
      next: [
        "Print the dictionary keys to see what is actually there.",
        "Use data.get('key') with a default instead of data['key'] when the key may be missing.",
        "Check where the data comes from. The source may have changed its field names.",
      ],
    },
    {
      id: "py-indexerror",
      family: "Python IndexError",
      patterns: [/indexerror/i, /list index out of range/i],
      meaning:
        "Your code asked for an item at a position that does not exist in a list, for example items[3] when the list only has 2 items.",
      cause:
        "Usually the list is shorter than expected, or empty, because earlier data was missing or a filter removed everything.",
      next: [
        "Check the length of the list before indexing into it.",
        "Log the list to see what it actually contains at that point.",
        "If you take the first or last item, handle the empty list case explicitly.",
      ],
    },
    {
      id: "py-attributeerror",
      family: "Python AttributeError",
      patterns: [/attributeerror/i, /has no attribute/i, /'noneType' object has no attribute/i],
      meaning:
        "Your code called a method or read an attribute that the object does not have. Very often the object is None, so it has no attributes at all.",
      cause:
        "Usually a function returned None instead of the expected object, a variable holds the wrong type, or a method name is misspelled.",
      next: [
        "Check whether the object is None at that point. If it is, find out why the function that made it returned None.",
        "Check the type with type(obj) and confirm the attribute name is spelled correctly.",
        "Check the library docs for the exact method name for your version.",
      ],
    },
    {
      id: "py-importerror",
      family: "Python ImportError",
      patterns: [
        /modulenotfounderror/i,
        /importerror/i,
        /no module named/i,
      ],
      meaning:
        "Python could not find the module you tried to import. The code stopped before it could run.",
      cause:
        "Usually the package is not installed, it is installed in a different Python environment or virtualenv, or the module name is misspelled.",
      next: [
        "Check you are running the right Python and the right virtualenv (which python, pip list).",
        "Install the package: pip install <name>.",
        "Check the spelling and case of the module name. Python imports are case sensitive.",
      ],
    },
    {
      id: "py-valueerror",
      family: "Python ValueError",
      patterns: [/valueerror/i, /invalid literal for int\(\)/i, /could not convert string to float/i],
      meaning:
        "A function got a value of the right type but the wrong content, for example int('abc') or a date string in an unexpected format.",
      cause:
        "Usually input data is shaped differently than the code assumes, for example empty strings, extra whitespace, or a different date format.",
      next: [
        "Print the value that failed to convert and compare it with what the code expects.",
        "Strip whitespace and handle empty strings before converting.",
        "Validate or clean the input at the point it enters your code, not deep inside it.",
      ],
    },
    {
      id: "py-typeerror",
      family: "Python TypeError",
      patterns: [/typeerror/i, /unsupported operand type/i, /takes .* positional argument/i, /missing .* required positional argument/i],
      meaning:
        "An operation got a value of the wrong type, or a function was called with the wrong number of arguments.",
      cause:
        "Usually a variable holds a different type than expected, for example a string where a number was needed, or a function call is missing an argument.",
      next: [
        "Read the message closely. It usually names the types involved.",
        "Print the type of the value with type(x) just before the failing line.",
        "Check the function signature against the call. Count the arguments.",
      ],
    },
    {
      id: "py-zerodivision",
      family: "Python ZeroDivisionError",
      patterns: [/zerodivisionerror/i, /division by zero/i],
      meaning:
        "Your code tried to divide by zero, which is undefined. Python refuses and raises an error.",
      cause:
        "Usually a denominator computed from data turned out to be zero, for example a count of zero items, or an empty list used as a divisor.",
      next: [
        "Check what the denominator is and why it is zero.",
        "Guard the division: only divide when the denominator is not zero, and decide what the result should be in that case.",
      ],
    },
    // ---------- Node.js ----------
    {
      id: "node-enoent",
      family: "Node.js ENOENT",
      patterns: [/enoent/i, /no such file or directory/i],
      meaning:
        "Node tried to open a file or folder that does not exist at that path.",
      cause:
        "Usually a wrong relative path, a file that was moved or deleted, or code running from a different working directory than expected.",
      next: [
        "Copy the path from the error and check it exists from the directory the process runs in.",
        "Use an absolute path or resolve relative to the script with path.join(__dirname, ...).",
        "Check the working directory: a relative path means something different depending on where you start the process.",
      ],
    },
    {
      id: "node-eaddrinuse",
      family: "Node.js EADDRINUSE",
      patterns: [/eaddrinuse/i, /address already in use/i, /port .* is already in use/i],
      meaning:
        "Your server tried to listen on a port that is already taken by another process.",
      cause:
        "Usually an earlier copy of the server is still running, or another program already uses that port.",
      next: [
        "Find what holds the port (lsof -i :PORT or netstat) and stop the old process.",
        "Or start your server on a different port.",
        "Check for a crashed process that never released the port.",
      ],
    },
    {
      id: "node-module-not-found",
      family: "Node.js MODULE_NOT_FOUND",
      patterns: [/cannot find module/i, /err_module_not_found/i, /module_not_found/i],
      meaning:
        "Node could not find the module you tried to require or import.",
      cause:
        "Usually the package is not installed, the path in the import is wrong, or the code runs from a directory where node_modules is not visible.",
      next: [
        "Run npm install to install missing dependencies.",
        "Check the import path. Relative imports need the right number of ../ segments.",
        "Check for a typo or wrong casing in the module name. File paths are case sensitive on Linux.",
      ],
    },
    // ---------- HTTP ----------
    {
      id: "http-400",
      family: "HTTP 400 Bad Request",
      patterns: [/\b400\b.*bad request/i, /bad request.*\b400\b/i, /status:? 400/i],
      meaning:
        "The server could not understand the request, usually because the data sent was malformed or failed validation.",
      cause:
        "Usually a missing required field, a wrong data type in the request body, or malformed JSON.",
      next: [
        "Check the response body. It usually names the field that failed validation.",
        "Validate the JSON you send and check the Content-Type header is application/json.",
        "Compare the payload against the API docs field by field.",
      ],
    },
    {
      id: "http-401",
      family: "HTTP 401 Unauthorized",
      patterns: [/\b401\b.*unauthorized/i, /unauthorized.*\b401\b/i, /status:? 401/i],
      meaning:
        "The request had no valid credentials, so the server refused to say who you are.",
      cause:
        "Usually a missing, expired, or wrong API key or token, or the Authorization header was never sent.",
      next: [
        "Check the API key or token is present and has not expired.",
        "Check the Authorization header format, for example Bearer <token>.",
        "Re-authenticate and retry with a fresh token.",
      ],
    },
    {
      id: "http-403",
      family: "HTTP 403 Forbidden",
      patterns: [/\b403\b.*forbidden/i, /forbidden.*\b403\b/i, /status:? 403/i],
      meaning:
        "The server knows who you are, but your account is not allowed to do this. Authentication worked, permission did not.",
      cause:
        "Usually the token lacks the required scope or role, or the resource belongs to another account or workspace.",
      next: [
        "Check the token scopes and the role of the account.",
        "Confirm the resource ID belongs to the same account or workspace.",
        "If you just changed permissions, get a fresh token. Old tokens keep old scopes.",
      ],
    },
    {
      id: "http-404",
      family: "HTTP 404 Not Found",
      patterns: [/\b404\b.*not found/i, /not found.*\b404\b/i, /status:? 404/i],
      meaning:
        "The server has no resource at that URL. The address is wrong, or the thing was moved or deleted.",
      cause:
        "Usually a typo in the URL, a wrong base URL, or an ID that does not exist.",
      next: [
        "Check the URL for typos, including the base URL and version prefix like /v1/.",
        "Confirm the ID in the URL actually exists.",
        "Check the API docs for the correct path. Endpoints change between API versions.",
      ],
    },
    {
      id: "http-429",
      family: "HTTP 429 Too Many Requests",
      patterns: [/\b429\b.*too many requests/i, /too many requests.*\b429\b/i, /rate limit/i, /status:? 429/i],
      meaning:
        "You sent requests too fast and the server throttled you. It is asking you to slow down.",
      cause:
        "Usually a loop or retry storm that fires requests without waiting, or a burst that hit the provider's per-minute limit.",
      next: [
        "Read the Retry-After header in the response and wait that long before retrying.",
        "Add backoff with jitter between retries instead of retrying immediately.",
        "Check your usage against the provider's rate limits and spread the work out.",
      ],
    },
    {
      id: "http-500",
      family: "HTTP 500 Internal Server Error",
      patterns: [/\b500\b.*internal server error/i, /internal server error.*\b500\b/i, /status:? 500/i],
      meaning:
        "The server itself broke while handling the request. The problem is on the server side, not in your request.",
      cause:
        "Usually an unhandled exception, a bug in a recent deploy, or a broken dependency on the server.",
      next: [
        "Retry once. A transient failure often clears on its own.",
        "If it keeps failing, check the server logs for the matching timestamp.",
        "If it started after a deploy, the deploy is the prime suspect. Roll back or fix forward.",
      ],
    },
    {
      id: "http-502",
      family: "HTTP 502 Bad Gateway",
      patterns: [/\b502\b.*bad gateway/i, /bad gateway.*\b502\b/i, /status:? 502/i],
      meaning:
        "A proxy or load balancer in front of the server got a bad response from the server behind it, or no response at all.",
      cause:
        "Usually the backend service is down, restarting, or crashing on that request.",
      next: [
        "Check whether the backend service is running and healthy.",
        "Look at the backend logs for crashes or out-of-memory kills at that time.",
        "Check the proxy timeout. A slow backend can look like a bad gateway.",
      ],
    },
    {
      id: "http-503",
      family: "HTTP 503 Service Unavailable",
      patterns: [/\b503\b.*service unavailable/i, /service unavailable.*\b503\b/i, /status:? 503/i],
      meaning:
        "The server is temporarily unable to handle the request, usually because it is overloaded or down for maintenance.",
      cause:
        "Usually traffic above capacity, a deploy in progress, or a dependency that is down.",
      next: [
        "Retry with backoff. A 503 is often temporary.",
        "Check the service status page and your own capacity and error dashboards.",
        "If the load is real traffic, scale up or shed load. If it is a deploy, wait for it to finish.",
      ],
    },
    // ---------- Infrastructure ----------
    {
      id: "db-connection",
      family: "Database connection error",
      patterns: [
        /econnrefused/i,
        /connection refused/i,
        /could not connect to server/i,
        /failed to connect to .*database/i,
        /database .* is not available/i,
        /connection timed out/i,
        /timeout.*database/i,
        /too many connections/i,
        /access denied for user/i,
        /authentication failed.*(postgres|mysql|mongo|database)/i,
        /password authentication failed/i,
      ],
      meaning:
        "Your application could not reach the database, or the database refused the login. No query ever ran.",
      cause:
        "Usually the database is down or unreachable, the host or port is wrong, the credentials are wrong, or the connection pool is exhausted.",
      next: [
        "Check the database is running and reachable from the machine running your code (try the host and port directly).",
        "Check the connection string: host, port, database name, username and password.",
        "Check the pool is not exhausted and that old connections are being closed.",
      ],
    },
    {
      id: "cors",
      family: "CORS error",
      patterns: [/cors/i, /access-control-allow-origin/i, /blocked by cors policy/i, /has been blocked by cors/i],
      meaning:
        "The browser blocked a request from your web page to another origin (a different domain, port, or protocol) because that server did not allow it.",
      cause:
        "The server is missing the Access-Control-Allow-Origin header for your origin, or it does not handle the preflight OPTIONS request.",
      next: [
        "Check the server sends Access-Control-Allow-Origin for your origin, and handles OPTIONS requests.",
        "Check you are not sending credentials (cookies) to an origin that only allows anonymous requests.",
        "During local development, point the frontend at the same origin or use the dev server proxy instead of disabling browser security.",
      ],
    },
    {
      id: "dns",
      family: "DNS error",
      patterns: [/enotfound/i, /getaddrinfo/i, /dns.*(fail|error|not found|unresolved)/i, /name not resolved/i, /could not resolve host/i, /err_name_not_resolved/i, /unknown host/i],
      meaning:
        "The hostname could not be turned into an IP address, so no connection was ever made. The name does not resolve.",
      cause:
        "Usually a typo in the hostname, a DNS record that does not exist, or a DNS server that is unreachable.",
      next: [
        "Check the hostname for typos.",
        "Check the DNS record exists with a lookup tool (nslookup or dig).",
        "Try another network or DNS server to rule out a local DNS problem.",
      ],
    },
    {
      id: "tls-cert",
      family: "TLS / certificate error",
      patterns: [
        /cert.*(expired|invalid|untrusted|self.signed|revoked)/i,
        /ssl.*(error|certificate|handshake)/i,
        /tls.*(error|certificate|handshake)/i,
        /err_cert/i,
        /unable to verify the first certificate/i,
        /self signed certificate/i,
        /certificate has expired/i,
      ],
      meaning:
        "The secure connection failed because the server's certificate could not be trusted or has expired. The client refused to continue.",
      cause:
        "Usually an expired certificate, a certificate for a different hostname, a missing intermediate certificate, or a self-signed certificate in a test environment.",
      next: [
        "Check the certificate expiry date and renew it if it has expired.",
        "Check the certificate covers the exact hostname being used.",
        "Check the full certificate chain is served, including intermediates.",
      ],
    },
    {
      id: "oom",
      family: "Out of memory",
      patterns: [
        /out of memory/i,
        /heap out of memory/i,
        /javascript heap out of memory/i,
        /memoryerror/i,
        /killed.*(out of memory|oom)/i,
        /cannot allocate memory/i,
      ],
      meaning:
        "The process ran out of memory and was stopped. It was using more RAM than the system allowed.",
      cause:
        "Usually a memory leak, a dataset loaded entirely into memory, or a heap limit that is too small for the workload.",
      next: [
        "Find what grows the memory: log heap size over time and look for unbounded arrays or caches.",
        "Process large data in chunks or streams instead of loading it all at once.",
        "Raise the heap limit (for Node: --max-old-space-size) only after checking for a leak. A bigger limit hides the leak, it does not fix it.",
      ],
    },
  ];

  // Lines that carry no information and should be skipped when picking
  // the key line of an error.
  var NOISE_LINE = /^\s*(at\s+|File "|Traceback \(most recent call last\)|^\s*$)/i;

  function extractErrorType(text) {
    var first = (text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean)[0] || "";
    // "Traceback (most recent call last):" then the last line holds the error.
    var lines = (text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var last = lines[lines.length - 1] || "";
    if (/traceback/i.test(first) && last) return last.split(":")[0];
    var m = first.match(/^([A-Za-z_][\w.]*?(?:Error|Exception|Error\b)[\w.]*)\s*:/);
    if (m) return m[1];
    var m2 = first.match(/^([A-Z][A-Z0-9_]{2,})\b/);
    if (m2) return m2[1];
    return first.length > 80 ? first.slice(0, 80) + "..." : first;
  }

  function extractKeyLine(text) {
    var lines = (text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (NOISE_LINE.test(line)) continue;
      if (/error|exception|failed|refused|not found|invalid|expired|denied|timeout/i.test(line)) return line;
    }
    return lines[0] || "";
  }

  function explain(text) {
    var input = (text || "").trim();
    if (!input) {
      return {
        matched: false,
        family: "No error text",
        title: "No error text selected",
        meaning: "Nothing was selected, so there is nothing to explain.",
        cause: "The context menu was used without selecting any text first.",
        next: ["Select the error text on the page first, then right-click and choose Explain this error."],
        errorType: "",
        keyLine: "",
      };
    }

    for (var i = 0; i < RULES.length; i++) {
      var rule = RULES[i];
      for (var j = 0; j < rule.patterns.length; j++) {
        if (rule.patterns[j].test(input)) {
          return {
            matched: true,
            family: rule.family,
            title: rule.family,
            meaning: rule.meaning,
            cause: rule.cause,
            next: rule.next.slice(),
            errorType: extractErrorType(input),
            keyLine: extractKeyLine(input),
          };
        }
      }
    }

    // No rule matched. Say so plainly and give the generic breakdown.
    return {
      matched: false,
      family: "Unknown error",
      title: "Unknown error",
      meaning:
        "This error does not match any pattern this extension knows yet. That does not mean it is mysterious, only that no built-in rule covers it.",
      cause:
        "The error text may come from a library or service this extension has no rule for, or the key detail may be in a part of the message that was not selected.",
      next: [
        "Read the key line below. It usually names the failing thing.",
        "Search the exact error message online, in quotes, with the name of the library or service.",
        "Check what changed just before the error appeared: a deploy, a config change, or new data.",
      ],
      errorType: extractErrorType(input),
      keyLine: extractKeyLine(input),
    };
  }

  function formatPlain(result) {
    var out = [];
    out.push(result.title);
    out.push("");
    out.push("What it means: " + result.meaning);
    out.push("");
    out.push("Likely cause: " + result.cause);
    out.push("");
    out.push("What to try next:");
    result.next.forEach(function (step, idx) {
      out.push((idx + 1) + ". " + step);
    });
    if (result.keyLine) {
      out.push("");
      out.push("Key line: " + result.keyLine);
    }
    return out.join("\n");
  }

  return {
    explain: explain,
    formatPlain: formatPlain,
    ruleCount: RULES.length,
    ruleFamilies: RULES.map(function (r) { return r.family; }),
  };
});
