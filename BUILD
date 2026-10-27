# In-tree Gerrit plugin: the OpenAPI viewer (runtime Swagger UI).
#
# Swagger UI assets come from the swagger-ui-dist WebJar (Maven Central, wired as
# @swagger_ui_dist_webjar in gerrit's plugins/external_plugin_deps.MODULE.bazel) --
# no npm. The OpenAPI specs come from one of two build-selectable sources:
#
#   bazel build plugins/gerrit-openapi-viewer                                  (default)
#   bazel build --define=openapi=consume-openapi-from-gerrit-tree plugins/gerrit-openapi-viewer
#       -> the live //tools/openapi build in this Gerrit tree: always version-matched
#          to the instance, no release pin. Resolvable only inside the Gerrit tree.
#
#   bazel build --define=openapi=consume-openapi-from-published-bundle plugins/gerrit-openapi-viewer
#       -> the pinned gerrit-openapi release bundle (@gerrit_openapi_bundle): a fixed,
#          versioned artifact; also the source a future standalone build would use.
#
# Both land the same files at the same static/ paths, so the Java/html/init is
# source-agnostic. The @gerrit_openapi_bundle repository is fetched only when the
# bundle source is selected (repository rules are lazy), so the default tree build
# needs no network.

load("//tools/bzl:plugin.bzl", "gerrit_plugin")

# Only --define=openapi=consume-openapi-from-published-bundle picks the released bundle;
# anything else (including no --define, or consume-openapi-from-gerrit-tree) uses the
# in-tree //tools/openapi spec.
config_setting(
    name = "spec_from_bundle",
    define_values = {"openapi": "consume-openapi-from-published-bundle"},
)

_WEBJAR = "@swagger_ui_dist_webjar//file"
_WEBJAR_PREFIX = "META-INF/resources/webjars/swagger-ui-dist/5.34.0"

[
    genrule(
        name = "swagger_ui_" + suffix,
        srcs = [_WEBJAR],
        outs = ["src/main/resources/static/swagger-ui/" + filename],
        cmd = "unzip -p $(location %s) %s/%s > $@" % (_WEBJAR, _WEBJAR_PREFIX, filename),
    )
    for suffix, filename in [
        ("css", "swagger-ui.css"),
        ("bundle_js", "swagger-ui-bundle.js"),
        ("standalone_preset_js", "swagger-ui-standalone-preset.js"),
        ("license", "LICENSE"),
        ("notice", "NOTICE"),
    ]
]

_BUNDLE = "@gerrit_openapi_bundle//file"

# Per-area slices served under static/domains/. Keep in sync with the `urls` dropdown in
# src/main/resources/static/rest-api-openapi-init.js.
_DOMAINS = [
    "access",
    "accounts",
    "changes",
    "config",
    "flow",
    "groups",
    "plugins",
    "projects",
]

# Merged document -> static/rest-api-openapi.json. Default (tree): copy
# //tools/openapi:openapi_json. Bundle: unzip openapi.json from the release zip.
genrule(
    name = "openapi_spec_merged",
    srcs = select({
        ":spec_from_bundle": [_BUNDLE],
        "//conditions:default": ["//tools/openapi:openapi_json"],
    }),
    outs = ["src/main/resources/static/rest-api-openapi.json"],
    cmd = select({
        ":spec_from_bundle": "unzip -p $(location %s) openapi.json > $@" % _BUNDLE,
        "//conditions:default": "cp $(location //tools/openapi:openapi_json) $@",
    }),
)

[
    genrule(
        name = "openapi_spec_" + d,
        srcs = select({
            ":spec_from_bundle": [_BUNDLE],
            "//conditions:default": ["//tools/openapi:openapi_" + d + "_json"],
        }),
        outs = ["src/main/resources/static/domains/" + d + ".json"],
        cmd = select({
            ":spec_from_bundle": "unzip -p $(location %s) domains/%s.json > $@" % (_BUNDLE, d),
            "//conditions:default": "cp $(location //tools/openapi:openapi_%s_json) $@" % d,
        }),
    )
    for d in _DOMAINS
]

gerrit_plugin(
    name = "gerrit-openapi-viewer",
    srcs = glob(["src/main/java/**/*.java"]),
    manifest_entries = [
        "Gerrit-PluginName: gerrit-openapi-viewer",
        "Gerrit-Module: com.googlesource.gerrit.plugins.openapiviewer.Module",
        "Gerrit-HttpModule: com.googlesource.gerrit.plugins.openapiviewer.HttpModule",
        "Implementation-Title: Gerrit OpenAPI viewer",
    ],
    resources = glob(["src/main/resources/**/*"]) + [
        ":swagger_ui_css",
        ":swagger_ui_bundle_js",
        ":swagger_ui_standalone_preset_js",
        ":swagger_ui_license",
        ":swagger_ui_notice",
        ":openapi_spec_merged",
    ] + [":openapi_spec_" + d for d in _DOMAINS],
)
