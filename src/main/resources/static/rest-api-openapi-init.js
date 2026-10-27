// Gerrit guards every JSON REST response against XSSI/JSON-hijacking by
// prefixing the body with the magic line )]}' . Swagger UI parses the raw
// body as JSON, so without stripping that prefix "Execute" reports
// "can't parse JSON". Strip it (and re-parse) before Swagger UI sees it.
const GERRIT_XSSI_PREFIX = ")]}'";

// Strip Gerrit's XSSI guard prefix from a raw response body string.
function stripXssi(text) {
  if (typeof text === 'string' && text.startsWith(GERRIT_XSSI_PREFIX)) {
    return text.slice(GERRIT_XSSI_PREFIX.length).replace(/^\r?\n/, '');
  }
  return text;
}

function stripGerritXssiPrefix(response) {
  if (typeof response.text === 'string'
      && response.text.startsWith(GERRIT_XSSI_PREFIX)) {
    response.text = stripXssi(response.text);
    response.data = response.text;
    try {
      response.body = JSON.parse(response.text);
      response.obj = response.body;
    } catch (e) {
      // Non-JSON body (e.g. a plain-text or diff endpoint); leave as text.
    }
  }
  return response;
}

// The Gerrit base URL this viewer is served from: the page lives at
// <contextPath>/plugins/gerrit-openapi-viewer/static/index.html, so everything
// before that marker is Gerrit's context path (empty when mounted at root).
function gerritBase() {
  const marker = '/plugins/gerrit-openapi-viewer/';
  const i = window.location.pathname.indexOf(marker);
  const ctx = i >= 0 ? window.location.pathname.slice(0, i) : '';
  return window.location.origin + ctx;
}

// The published spec's `servers` point at the reference host
// (https://{host} with host=gerrit-review.googlesource.com) because the spec is a
// shared artifact also consumed by SDK generators. When the viewer is embedded in a
// Gerrit instance, "Try it out" must hit THAT instance, not gerrit-review. Rewrite the
// loaded spec's servers to this instance, authenticated endpoint FIRST so Swagger UI
// pre-selects it (servers[0] is the default) -- nobody has to open the dropdown to run
// an authenticated call. Both entries reuse the browser's existing Gerrit session via
// interceptRequest (session cookie, plus the XSRF header on writes), so we also drop the
// basicAuth scheme: no
// Authorize prompt, no username/token -- the /a endpoint just runs as the logged-in user.
function retargetSpecServers(response) {
  if (typeof response.text !== 'string' || response.text.indexOf('"openapi"') === -1) {
    return; // not an OpenAPI document (e.g. a Try-it-out API response)
  }
  let doc;
  try {
    doc = JSON.parse(response.text);
  } catch (e) {
    return;
  }
  if (!doc || !Array.isArray(doc.servers)) {
    return;
  }
  const base = gerritBase();
  doc.servers = [
    { url: base + '/a', description: 'Authenticated endpoints (your current Gerrit session)' },
    { url: base, description: 'Anonymously accessible endpoints' },
  ];
  // Drop the whole securitySchemes object (not just the basicAuth key): an empty
  // securitySchemes still makes Swagger UI render the Authorize button. With it gone and
  // top-level security cleared, there is no Authorize prompt -- auth rides on the session.
  if (doc.components) {
    delete doc.components.securitySchemes;
  }
  doc.security = []; // rely on the ambient browser session, not a declared security scheme
  response.text = JSON.stringify(doc);
  response.data = response.text;
  response.body = doc;
  response.obj = doc;
}

// Read a non-HttpOnly cookie value (Gerrit's XSRF_TOKEN is deliberately JS-readable).
function readCookie(name) {
  const key = name + '=';
  let value = '';
  document.cookie.split(';').some((c) => {
    const t = c.trim();
    if (t.startsWith(key)) {
      value = t.slice(key.length);
      return true;
    }
    return false;
  });
  return value;
}

// Single sign-on for "Try it out": the viewer is same-origin with Gerrit, so reuse the
// logged-in browser session (credentials: same-origin) instead of prompting for credentials.
// Mirror PolyGerrit's REST client: attach the XSRF header -- from the JS-readable XSRF_TOKEN
// cookie -- only on state-changing methods (Gerrit ignores it on GET/HEAD).
function interceptRequest(request) {
  request.credentials = 'same-origin';
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const token = readCookie('XSRF_TOKEN');
    if (token) {
      request.headers = request.headers || {};
      request.headers['X-Gerrit-Auth'] = token;
    }
  }
  return request;
}

function interceptResponse(response) {
  stripGerritXssiPrefix(response); // REST responses: drop the )]}' guard
  retargetSpecServers(response); // spec documents: point servers at this instance
  return response;
}

// Per-domain slices (each self-contained, with its own component closure) plus
// the full merged spec, offered through Swagger UI's top-bar `urls` dropdown.
// Both are unzipped at build time from the pinned gerrit-openapi release bundle
// into static/ (domains/*.json and rest-api-openapi.json; see BUILD), not vendored.
const CORE_URLS = [
  { url: 'domains/changes.json',  name: 'Changes'  },
  { url: 'domains/accounts.json', name: 'Accounts' },
  { url: 'domains/projects.json', name: 'Projects' },
  { url: 'domains/config.json',   name: 'Config'   },
  { url: 'domains/groups.json',   name: 'Groups'   },
  { url: 'domains/access.json',   name: 'Access'   },
  { url: 'domains/flow.json',     name: 'Flow'     },
  { url: 'domains/plugins.json',  name: 'Plugins'  },
  { url: 'rest-api-openapi.json', name: 'All (merged)' },
];

// Optional plugin specs are discovered at runtime. A plugin cannot enumerate other
// installed plugins server-side (PluginLoader.getPlugins() is empty from a plugin's own
// injector -- that state is core-only), so the list comes from the client, with
// progressive enhancement:
//   1. GET /plugins/?all gives the installed plugins. On a core new enough to report it,
//      each entry carries a `capabilities` array (from the plugin's Gerrit-Capabilities
//      manifest header) -- then "openapi" is authoritative: include with NO probe, absent
//      means skip. On older core (no capabilities field) we probe that plugin's spec URL.
//   2. If /plugins/?all is not permitted (no View Plugins), probe the known fallback set.
// Probing fetches /plugins/<name>/Documentation/rest-api-openapi.json (readable by any
// user) and keeps the ones that actually serve a document.
const FALLBACK_PLUGINS = ['checks', 'code-owners'];

function specEntry(base, name) {
  return {
    url: base + '/plugins/' + name + '/Documentation/rest-api-openapi.json',
    name: name + ' (plugin)',
  };
}

// The raw name -> PluginInfo map from Gerrit (entries may carry `capabilities`), or null
// when the list is not permitted.
async function listInstalledPlugins(base) {
  try {
    const res = await fetch(base + '/plugins/?all', { credentials: 'same-origin' });
    if (!res.ok) {
      return null;
    }
    return JSON.parse(stripXssi(await res.text())) || {};
  } catch (e) {
    return null;
  }
}

async function probePluginSpecs(base, names) {
  const found = await Promise.all(names.map(async (name) => {
    const entry = specEntry(base, name);
    try {
      const res = await fetch(entry.url, { credentials: 'same-origin' });
      return res.ok ? entry : null;
    } catch (e) {
      return null;
    }
  }));
  return found.filter(Boolean);
}

async function discoverPluginSpecs() {
  const base = gerritBase();
  const plugins = await listInstalledPlugins(base);
  if (!plugins) {
    return probePluginSpecs(base, FALLBACK_PLUGINS);
  }
  const declared = [];
  const undeclared = [];
  Object.keys(plugins).forEach((name) => {
    const info = plugins[name];
    if (info && Array.isArray(info.capabilities)) {
      if (info.capabilities.indexOf('openapi') !== -1) {
        declared.push(specEntry(base, name)); // authoritative -- no probe
      }
    } else {
      undeclared.push(name); // older core / plugin didn't declare -> probe
    }
  });
  return declared.concat(await probePluginSpecs(base, undeclared));
}

// StandaloneLayout is required for the dropdown to render.
window.addEventListener('load', async () => {
  let urls = CORE_URLS;
  try {
    urls = CORE_URLS.concat(await discoverPluginSpecs());
  } catch (e) {
    // discovery failed entirely; fall back to the core-only dropdown
  }
  // Deep-link: ?plugin=<name> preselects that plugin's spec (e.g. from a link on
  // Gerrit's admin Plugins page), if it was discovered. Otherwise default to Changes.
  let primaryName = 'Changes';
  const requested = new URLSearchParams(window.location.search).get('plugin');
  if (requested && urls.some((u) => u.name === requested + ' (plugin)')) {
    primaryName = requested + ' (plugin)';
  }
  window.ui = SwaggerUIBundle({
    urls: urls,
    'urls.primaryName': primaryName,
    dom_id: '#swagger-ui',
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset,
    ],
    layout: 'StandaloneLayout',
    requestInterceptor: interceptRequest,
    responseInterceptor: interceptResponse,
  });
});
