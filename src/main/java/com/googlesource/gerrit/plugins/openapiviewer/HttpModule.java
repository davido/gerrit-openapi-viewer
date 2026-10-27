// Copyright (C) 2026 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.googlesource.gerrit.plugins.openapiviewer;

import com.google.inject.servlet.ServletModule;

/**
 * Gerrit-HttpModule for the OpenAPI viewer.
 *
 * <p>The viewer is static: the Swagger UI shell and the OpenAPI specs (unzipped at build time from
 * the pinned gerrit-openapi bundle) ship in the plugin jar under {@code static/} and are served at
 * {@code /plugins/<name>/static/} by Gerrit's own plugin resource handler. This module only adds
 * access control: {@link OpenApiViewerFilter} is scoped to {@code /static/*} (the plugin's own
 * namespace, not an {@code AllRequestFilter} over all of Gerrit) and lets the request through only
 * for administrators or users granted the {@code viewOpenApi} capability, else returns {@code 403}.
 *
 * <p>The XSSI-prefix strip and the per-domain {@code urls} dropdown live client-side in {@code
 * rest-api-openapi-init.js}.
 */
public class HttpModule extends ServletModule {
  @Override
  protected void configureServlets() {
    // Gate the viewer's static assets; authorized requests fall through to Gerrit's default
    // plugin resource serving. Scoped to this plugin's /static/* namespace.
    filter("/static/*").through(OpenApiViewerFilter.class);
  }
}
