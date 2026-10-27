#!/usr/bin/env bash
#
# Re-pin the OpenAPI spec bundle this plugin serves.
#
# gerrit-openapi-viewer does not vendor specs. At build time it unzips the merged
# OpenAPI document plus the per-area domain slices out of a pinned gerrit-openapi
# release bundle (@gerrit_openapi_bundle, declared in Gerrit's
# plugins/external_plugin_deps.MODULE.bazel). Moving to a newer spec is a one-line
# change: bump that http_file's URL + sha256.
#
# This script fetches a given gerrit-openapi release's bundle, verifies it carries the
# entries the BUILD unzips, and prints the ready-to-paste http_file stanza (with the
# computed sha256). It changes nothing in this tree.
#
# Usage: ./update.sh [tag]     (default: the latest davido/gerrit-openapi release)
set -euo pipefail
cd "$(dirname "$0")"

REPO=davido/gerrit-openapi
# Must match _DOMAINS in BUILD and the `urls` dropdown in
# src/main/resources/static/rest-api-openapi-init.js.
DOMAINS=(access accounts changes config flow groups plugins projects)

TAG=${1:-}
if [ -z "$TAG" ]; then
  command -v gh >/dev/null || { echo "error: no tag given and gh not installed" >&2; exit 1; }
  TAG=$(gh release view --repo "$REPO" --json tagName -q .tagName)
fi
VERSION=${TAG#v}
ASSET="openapi-json-bundle-${VERSION}.zip"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

echo "1/3 download ${URL}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$ASSET" "$URL"

echo "2/3 verify the bundle carries the entries the BUILD unzips"
unzip -Z1 "$TMP/$ASSET" | sort > "$TMP/entries.txt"
missing=()
grep -qx "openapi.json" "$TMP/entries.txt" || missing+=("openapi.json")
for d in "${DOMAINS[@]}"; do
  grep -qx "domains/$d.json" "$TMP/entries.txt" || missing+=("domains/$d.json")
done
if [ "${#missing[@]}" -ne 0 ]; then
  echo "   error: bundle is missing expected entries: ${missing[*]}" >&2
  exit 1
fi
SHA=$(shasum -a 256 "$TMP/$ASSET" | cut -d' ' -f1)
echo "   ok: openapi.json + ${#DOMAINS[@]} domain slices present; sha256 ${SHA}"

echo "3/3 paste into Gerrit's plugins/external_plugin_deps.MODULE.bazel,"
echo "    replacing the existing gerrit_openapi_bundle http_file:"
cat <<EOF

http_file(
    name = "gerrit_openapi_bundle",
    downloaded_file_path = "openapi-json-bundle.zip",
    sha256 = "${SHA}",
    urls = ["${URL}"],
)
EOF
