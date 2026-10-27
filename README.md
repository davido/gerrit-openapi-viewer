# gerrit-openapi-viewer

A Gerrit plugin that serves an interactive **Swagger UI** over Gerrit's REST API,
inside Gerrit. It adds an **OpenAPI** top-menu entry → **API Explorer**.

## What's here

- `src/main/java/.../openapiviewer/` — the plugin: `Module` (binds the TopMenu and the
  `viewOpenApi` capability), `OpenApiTopMenu` (the menu entry), `HttpModule` (installs the
  access filter), and `OpenApiCapability` / `CapabilityChecker` / `OpenApiViewerFilter`
  (access control — see below).
- `src/main/resources/static/` — the viewer: `index.html` and `rest-api-openapi-init.js`
  (Swagger UI init with the XSSI `)]}'` response-strip interceptor, a per-domain
  `urls` dropdown, and a server-retarget so "Try it out" calls the Gerrit instance
  serving the viewer rather than the spec's reference host). No specs are vendored here:
  the merged `rest-api-openapi.json` and the `domains/*.json` slices are a build output
  from a selectable source — by default the in-tree `//tools/openapi` build, or the
  pinned `gerrit-openapi` release bundle via `--define` (see **Build modes**). Swagger
  UI assets come from a Maven WebJar.
- `update.sh` — fetch a `gerrit-openapi` release bundle and print the `http_file`
  stanza (URL + sha256) to re-pin the bundle source.
- `BUILD` — `gerrit_plugin` packaging + the selectable spec source (in-tree
  `//tools/openapi` vs released bundle) and the WebJar unzip.

## Use it

Build in-tree (symlink into a Gerrit checkout as `plugins/gerrit-openapi-viewer`):

```sh
bazelisk build plugins/gerrit-openapi-viewer
cp bazel-bin/plugins/gerrit-openapi-viewer/gerrit-openapi-viewer.jar "$SITE/plugins/"
```

Reload Gerrit; **OpenAPI → API Explorer** opens the viewer (visible only to admins or
holders of the `viewOpenApi` capability — see **Access control**). Choose a domain
(or *All (merged)*) from the top-bar dropdown; "Try it out" runs against this instance.

Plugin APIs appear automatically. A plugin can't enumerate other installed plugins
server-side (`PluginLoader.getPlugins()` is empty from a plugin's own injector — that state
is core-only), so `init.js` does it client-side: it calls Gerrit's official
`GET /plugins/?all` for the installed plugin names (needs the **View Plugins** capability;
callers without it fall back to a known set, `checks` + `code-owners`), then probes each
`/plugins/<name>/Documentation/rest-api-openapi.json` (readable by any user) and adds the
ones that actually serve a spec. Install such a plugin and it shows up, no rebuild.

## Build modes

The specs come from one of two sources, chosen at build time:

```sh
# default: the live in-tree //tools/openapi build -- always matches this instance
bazelisk build plugins/gerrit-openapi-viewer

# opt in to the pinned, published release bundle instead
bazelisk build --define=openapi=consume-openapi-from-published-bundle \
    plugins/gerrit-openapi-viewer
```

Use the **default (in-tree)** when the viewer ships with the Gerrit it documents — the
spec can never drift from the server. Use the **bundle** to pin a specific published
`gerrit-openapi` release (and as the source a future standalone build would use). To move
the bundle to a newer release, bump `gerrit_openapi_bundle`'s URL + sha256 in Gerrit's
`plugins/external_plugin_deps.MODULE.bazel`; `update.sh` prints the stanza:

```sh
./update.sh              # latest gerrit-openapi release
./update.sh v3.16.0-SNAPSHOT
```

## Access control

The viewer is gated: only **server administrators** or users granted the **`viewOpenApi`**
capability can open the Explorer or read its specs. A scoped `javax.servlet` filter on
`/plugins/gerrit-openapi-viewer/static/*` (`OpenApiViewerFilter`) checks `PermissionBackend`
and returns `403` otherwise — it is scoped to the plugin's own namespace, not an
`AllRequestFilter` over all of Gerrit. The menu entry still shows; the page enforces.

Grant it like any plugin capability, e.g. in `All-Projects` `project.config`:

```
[capability]
  gerrit-openapi-viewer-viewOpenApi = group My-API-Users
```

"Try it out" calls still go out as the current user and remain independently subject to
Gerrit's normal REST ACLs — the capability only controls who can open the viewer.

## License

Apache-2.0.
