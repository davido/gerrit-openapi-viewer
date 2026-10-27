# Proposal: retrieve the OpenAPI spec — build-time pin + optional runtime reload

> **Status:** Option A (build-time bundle pin) is **implemented** — the plugin fetches
> `@gerrit_openapi_bundle` and unzips the spec at build time (`update.sh` re-pins it). What
> remains unbuilt is **Option B** (runtime reload), which this doc now tracks.

Two complementary options, both wanted:

- **Option A (default): fetch at BUILD time** via a pinned `http_file`/`http_archive`
  repo — exactly like the existing `swagger_ui_dist_webjar`. This *replaces* the
  checked-in vendored spec with a URL + sha256 pin (reproducible, provenanced,
  no 500 KB blob in the repo).
- **Option B (opt-in): reload at RUNTIME** from the `gerrit-openapi` GitHub repo,
  surfaced as extra "Latest … (GitHub)" entries in the Swagger UI dropdown, gated
  by `gerrit.config` and default off.

They coexist cleanly: A produces the pinned spec baked into the jar (the stable
default selection); B, when enabled, adds live upstream entries alongside it.

## Option A — build-time fetch of a single versioned bundle (replaces vendoring)

Mirror the swagger-ui-dist WebJar pattern: fetch **one pinned, versioned bundle**
and unzip it. The `gerrit-openapi` publishing step produces a single
`openapi-json-bundle-<version>.zip` (the joined `openapi.json` + all
`domains/*.json`, plus an optional `manifest.json` with the version and per-file
sha256) and attaches it as a **GitHub Release asset** — a stable, byte-identical
URL per release. The plugin pins that one zip:

```python
http_file = use_repo_rule("@bazel_tools//tools/build_defs/repo:http.bzl", "http_file")

http_file(
    name = "gerrit_openapi_bundle",
    downloaded_file_path = "openapi-json-bundle.zip",
    sha256 = "<one sha256>",
    urls = ["https://github.com/davido/gerrit-openapi/releases/download/" +
            "v3.16.0-SNAPSHOT/openapi-json-bundle-3.16.0-SNAPSHOT.zip"],
)
```

In the plugin `BUILD`, genrules unzip `openapi.json` + each `domains/<d>.json` out
of `@gerrit_openapi_bundle//file` into `static/` (same shape as the swagger
`unzip -p … > $@` genrules), and the **vendored JSON is deleted** from the repo.
`update.sh` becomes "point at the new release bundle + bump the one sha256."

Why a single bundle (vs one `http_file` per spec):
- **one sha256 to bump**, not nine;
- **atomic** — merged + domains always come from the *same* generation (no
  half-updated set);
- the **versioned filename** makes the pin human-meaningful, and pinning the
  bundle pins the API **version**: `3.15.1` and `3.16.2` have different REST
  surfaces → different bytes → different sha256;
- it **mirrors swagger-ui** (one archive fetched + unzipped), and supplies the
  provenance the audit flagged as missing — the same release tag/bundle the SDKs
  can pin too.

### Publishing-side change (gerrit-openapi)
`update.sh`/a release step already stages `core/openapi.json` +
`core/domains/*.json`; add: build `openapi-json-bundle-<version>.zip` from them
(+ a `manifest.json` of version & per-file hashes), **tag** the release
(`v<version>`), and upload the zip as that release's asset. This also gives the
SDKs a tagged, hashed artifact to pin instead of a bare file copy.

### Fallbacks (until the release bundle exists)
- **N `http_file`s** (one per spec; each sha256 computable from the local files
  today) — works now without releases, but nine hashes and non-atomic.
- **`http_archive` of the repo tarball** at a pinned rev — one pin, but its sha256
  must come from GitHub codeload (needs a fetch to compute).

## Option B — runtime reload from GitHub (opt-in)

`gerrit.config`, default off:

```ini
[plugin "gerrit-openapi-viewer"]
    reloadFromGitHub = false                  # default
    githubRepo = davido/gerrit-openapi
    githubRef  = main                         # branch or release tag
```

Plumbing: the plugin reads the flags (`PluginConfigFactory`); the `HttpModule`
would also serve a tiny `config.js` at `static/config.js` exposing
`window.OPENAPI_VIEWER_CONFIG = {reloadFromGitHub, githubRawBase}`; `index.html`
loads it before `rest-api-openapi-init.js`; when enabled, init.js appends
`Latest — All (GitHub)` + `Latest — <Domain> (GitHub)` entries to the `urls`
dropdown pointing at the raw GitHub URLs. GitHub raw JSON is clean (no `)]}'`), so
the XSSI interceptor is a no-op there.

Why the dropdown, not a top-menu "reload": Swagger UI's `urls` selector is the
native multi-spec mechanism; a TopMenu entry is a static server link that can't
re-fetch into the running UI without a page reload + `?spec=` hack.

**Gating caveat (CSP):** the viewer page is served by Gerrit; fetching
`raw.githubusercontent.com` (→ `objects.githubusercontent.com`) is cross-origin.
CORS is fine (GitHub sends `Access-Control-Allow-Origin: *`), but the page's
`connect-src` must allow those hosts or the fetch is blocked. Document the admin
CSP setting; this is the main reason B is default-off.

## Why not two plugins or build-variants

- **Two plugins** — ~99% identical code differing only in whether GitHub entries
  appear; two jars to build/sign/deploy and they drift. Rejected.
- **Build-time variant jars** — same distribute/choose cost plus build-matrix
  complexity; a runtime flag achieves it from one artifact. Rejected as the
  default. (A single `--define openapi_viewer_github=off` to *omit* option-B code
  for strict air-gapped builds is a reasonable opt-out refinement, not the shape.)
- **One plugin, Option A pinned + Option B runtime-gated** — chosen: one artifact,
  admin toggles B in `gerrit.config` with no rebuild, A stays the stable default.

## Scope

- Option A: add N `http_file` decls to the host deps + N genrules in `BUILD` +
  `git rm` the vendored JSON + rework `update.sh` to bump rev/hashes. No new deps.
- Option B: config read + generated `config.js` (HttpModule) + ~15 lines in
  init.js + a documented CSP requirement.

Neither is build-verifiable in a sandbox without Gerrit's external repos; both
need one green in-tree build to confirm.
