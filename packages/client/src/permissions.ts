/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

// This subpath has no Zod import. The root of `@seamless-auth/types` does, so it
// stays `import type` everywhere in this package.
import {
  hasAllPermissions as includesAllOf,
  hasPermission as includesAnyOf,
} from '@seamless-auth/types/permission/matching';

import { hasScopedRole } from './scopedRoles';
import type { User } from './types';

/**
 * The fields these helpers read from the signed-in user. An older API leaves the
 * permission and organization fields out, which means unknown rather than none,
 * so every check against them answers false.
 */
export type UserAuthorization = Partial<
  Pick<User, 'roles' | 'permissions' | 'organizationRoles' | 'organizationPermissions'>
>;

export interface PermissionCheckOptions {
  /**
   * `true` counts only what the active organization grants, leaving out
   * instance-wide permissions. By default a permission is held if either grants it.
   */
  organization?: boolean;
}

function heldPermissions(
  user: UserAuthorization | null | undefined,
  options: PermissionCheckOptions | undefined
): unknown[] {
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const organization = list(user?.organizationPermissions);

  return options?.organization
    ? organization
    : [...list(user?.permissions), ...organization];
}

/**
 * Whether the user holds at least one of the required permissions. Matching is
 * exact: `invoices:write` does not satisfy `invoices:read`.
 *
 * For showing and hiding UI only. The server must still enforce.
 */
export function hasPermission(
  user: UserAuthorization | null | undefined,
  required: string | string[],
  options?: PermissionCheckOptions
): boolean {
  return includesAnyOf(heldPermissions(user, options), required);
}

/**
 * Whether the user holds every required permission. Requiring nothing answers
 * false. For showing and hiding UI only. The server must still enforce.
 */
export function hasAllPermissions(
  user: UserAuthorization | null | undefined,
  required: string | string[],
  options?: PermissionCheckOptions
): boolean {
  return includesAllOf(heldPermissions(user, options), required);
}

/**
 * Whether the user's instance roles satisfy at least one required role, with the
 * scoped matching of `hasScopedRole`. Organization roles never count: an
 * organization `admin` is not an instance `admin`. Use `hasOrganizationRole` for
 * those. For showing and hiding UI only. The server must still enforce.
 */
export function hasRole(
  user: UserAuthorization | null | undefined,
  required: string | string[]
): boolean {
  return hasScopedRole(user?.roles, required);
}

/**
 * Whether the user holds at least one of the required roles in the active
 * organization. Matching is exact and instance roles never count. For showing and
 * hiding UI only. The server must still enforce.
 */
export function hasOrganizationRole(
  user: UserAuthorization | null | undefined,
  required: string | string[]
): boolean {
  return includesAnyOf(user?.organizationRoles, required);
}
