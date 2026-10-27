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

import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.io.IOException;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletResponse;

/**
 * Gates the viewer's static assets (page, Swagger UI, specs) behind {@link CapabilityChecker}.
 * Scoped to the plugin's own {@code /static/*} namespace in {@link HttpModule}, so it fires only
 * for viewer requests -- unlike an {@code AllRequestFilter}, which would run on every Gerrit
 * request. Authorized users fall through to Gerrit's default plugin resource serving; everyone
 * else gets {@code 403}.
 */
@Singleton
class OpenApiViewerFilter implements Filter {
  private final CapabilityChecker checker;

  @Inject
  OpenApiViewerFilter(CapabilityChecker checker) {
    this.checker = checker;
  }

  @Override
  public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
      throws IOException, ServletException {
    if (checker.canView()) {
      chain.doFilter(req, res);
    } else {
      ((HttpServletResponse) res).sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden");
    }
  }

  @Override
  public void init(FilterConfig config) {}

  @Override
  public void destroy() {}
}
