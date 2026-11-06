/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import { useMemo } from 'react';

import {
  hasAllPermissions,
  hasOrganizationRole,
  hasPermission,
  hasRole,
  type PermissionCheckOptions,
  type User,
} from '@seamless-auth/client';
import { useAuth } from '@/AuthProvider';

export interface UsePermissionsResult {
  /** True while the session is being read. Every check answers false until then. */
  loading: boolean;
  /** Undefined when signed out. */
  roles: User['roles'] | undefined;
  /** Undefined when signed out or when the API is too old to send it. */
  permissions: User['permissions'];
  /** Undefined when signed out or when the API is too old to send it. */
  organizationRoles: User['organizationRoles'];
  /** Undefined when signed out or when the API is too old to send it. */
  organizationPermissions: User['organizationPermissions'];
  activeOrganizationId: User['activeOrganizationId'];
  hasPermission: (
    required: string | string[],
    options?: PermissionCheckOptions
  ) => boolean;
  hasAllPermissions: (
    required: string | string[],
    options?: PermissionCheckOptions
  ) => boolean;
  /** Instance roles only, with scoped matching. */
  hasRole: (required: string | string[]) => boolean;
  /** Roles in the active organization only, matched exactly. */
  hasOrganizationRole: (required: string | string[]) => boolean;
}

/**
 * The signed-in user's permissions and roles as of the last `/users/me` read, for
 * showing and hiding UI. The server must still enforce.
 */
export const usePermissions = (): UsePermissionsResult => {
  const { user, loading } = useAuth();

  return useMemo(
    () => ({
      loading,
      roles: user?.roles,
      permissions: user?.permissions,
      organizationRoles: user?.organizationRoles,
      organizationPermissions: user?.organizationPermissions,
      activeOrganizationId: user?.activeOrganizationId,
      hasPermission: (required, options) => hasPermission(user, required, options),
      hasAllPermissions: (required, options) =>
        hasAllPermissions(user, required, options),
      hasRole: required => hasRole(user, required),
      hasOrganizationRole: required => hasOrganizationRole(user, required),
    }),
    [user, loading]
  );
};
