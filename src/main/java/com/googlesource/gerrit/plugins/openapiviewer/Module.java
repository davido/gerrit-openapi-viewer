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

import com.google.gerrit.extensions.annotations.Exports;
import com.google.gerrit.extensions.config.CapabilityDefinition;
import com.google.gerrit.extensions.registration.DynamicSet;
import com.google.gerrit.extensions.webui.TopMenu;
import com.google.inject.AbstractModule;

/**
 * Gerrit-Module for the OpenAPI viewer.
 *
 * <p>Registers two things: the {@code viewOpenApi} {@link OpenApiCapability} (so administrators can
 * grant viewer access to non-admins), and the "OpenAPI" top-menu entry via {@link DynamicSet} (so
 * installing the plugin jar makes the entry appear, with no core edit). Menu visibility is not
 * authorization -- access to the viewer page and the specs is enforced by {@link
 * OpenApiViewerFilter} in {@link HttpModule}.
 */
public class Module extends AbstractModule {
  @Override
  protected void configure() {
    bind(CapabilityDefinition.class)
        .annotatedWith(Exports.named(OpenApiCapability.ID))
        .to(OpenApiCapability.class);
    DynamicSet.bind(binder(), TopMenu.class).to(OpenApiTopMenu.class);
  }
}
