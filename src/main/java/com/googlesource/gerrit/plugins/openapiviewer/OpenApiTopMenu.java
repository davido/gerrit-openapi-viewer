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

import com.google.common.collect.Lists;
import com.google.gerrit.extensions.annotations.PluginName;
import com.google.gerrit.extensions.client.MenuItem;
import com.google.gerrit.extensions.webui.TopMenu;
import com.google.inject.Inject;
import java.util.Collections;
import java.util.List;

/**
 * Contributes a single "OpenAPI" top-menu entry linking to the plugin-scoped viewer page served by
 * {@link HttpModule} at {@code /plugins/<name>/static/}.
 *
 * <p>The entry is added only for users who can actually open the viewer -- administrators or
 * holders of the {@code viewOpenApi} capability (see {@link CapabilityChecker}). Gerrit instantiates
 * this {@link TopMenu} per request, so the constructor-time check runs against the acting user (the
 * same pattern as the javamelody plugin's MonitoringTopMenu). This is UX only; {@link
 * OpenApiViewerFilter} independently enforces the same check on the page, so hiding the menu merely
 * avoids offering a link that would 403.
 */
public class OpenApiTopMenu implements TopMenu {
  private final List<MenuEntry> menuEntries = Lists.newArrayList();

  @Inject
  OpenApiTopMenu(@PluginName String pluginName, CapabilityChecker checker) {
    if (checker.canView()) {
      menuEntries.add(
          new MenuEntry(
              "OpenAPI",
              Collections.singletonList(
                  new MenuItem(
                      "API Explorer", "/plugins/" + pluginName + "/static/index.html", "_blank"))));
    }
  }

  @Override
  public List<MenuEntry> getEntries() {
    return menuEntries;
  }
}
