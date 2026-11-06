/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import {
  hasAllPermissions,
  hasOrganizationRole,
  hasPermission,
  hasRole,
} from '../src/permissions';
import type { User } from '../src/types';

// What an API older than the permission fields sends for `user`.
const olderApiUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  phone: null,
  roles: ['user'],
  activeOrganizationId: 'org-1',
};

const user: User = {
  ...olderApiUser,
  permissions: ['reports:read'],
  organizationRoles: ['admin'],
  organizationPermissions: ['projects:write'],
};

describe('hasPermission', () => {
  it('answers false for a missing user', () => {
    expect(hasPermission(null, 'reports:read')).toBe(false);
    expect(hasPermission(undefined, 'reports:read')).toBe(false);
  });

  it('answers false rather than throwing for an older API response', () => {
    expect(hasPermission(olderApiUser, 'reports:read')).toBe(false);
    expect(hasPermission(olderApiUser, 'reports:read', { organization: true })).toBe(
      false
    );
  });

  it('ignores a field that is not a list', () => {
    const malformed = {
      permissions: 'reports:read',
      organizationPermissions: { 0: 'reports:read' },
    } as unknown as User;

    expect(hasPermission(malformed, 'reports:read')).toBe(false);
  });

  it('matches exactly, with no wildcards or implied grants', () => {
    const holder = { permissions: ['invoices:write', 'admin', 'billing:*'] };

    expect(hasPermission(holder, 'invoices:write')).toBe(true);
    expect(hasPermission(holder, 'invoices:read')).toBe(false);
    expect(hasPermission(holder, 'admin:read')).toBe(false);
    expect(hasPermission(holder, 'billing:read')).toBe(false);
    expect(hasPermission(holder, 'invoices')).toBe(false);
  });

  it('counts instance and organization permissions by default', () => {
    expect(hasPermission(user, 'reports:read')).toBe(true);
    expect(hasPermission(user, 'projects:write')).toBe(true);
    expect(hasPermission(user, 'projects:read')).toBe(false);
  });

  it('counts only the active organization with the organization option', () => {
    const options = { organization: true } as const;

    expect(hasPermission(user, 'projects:write', options)).toBe(true);
    expect(hasPermission(user, 'reports:read', options)).toBe(false);
    expect(hasPermission(user, 'reports:read', { organization: false })).toBe(true);
  });

  it('passes when any of several permissions is held', () => {
    expect(hasPermission(user, ['nope', 'projects:write'])).toBe(true);
    expect(hasPermission(user, ['nope', 'also:nope'])).toBe(false);
    expect(hasPermission(user, [])).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('needs every permission, across instance and organization grants', () => {
    expect(hasAllPermissions(user, ['reports:read', 'projects:write'])).toBe(true);
    expect(hasAllPermissions(user, ['reports:read', 'nope'])).toBe(false);
  });

  it('respects the organization option', () => {
    expect(
      hasAllPermissions(user, ['reports:read', 'projects:write'], {
        organization: true,
      })
    ).toBe(false);
    expect(hasAllPermissions(user, 'projects:write', { organization: true })).toBe(true);
  });

  it('refuses an empty requirement and missing fields', () => {
    expect(hasAllPermissions(user, [])).toBe(false);
    expect(hasAllPermissions(olderApiUser, 'reports:read')).toBe(false);
    expect(hasAllPermissions(null, 'reports:read')).toBe(false);
  });
});

describe('hasRole', () => {
  it('uses scoped matching on instance roles', () => {
    const holder = { roles: ['admin:write'] };

    expect(hasRole(holder, 'admin:write')).toBe(true);
    expect(hasRole(holder, 'admin:read')).toBe(true);
    expect(hasRole(holder, 'admin')).toBe(false);
    expect(hasRole({ roles: ['admin'] }, ['nope', 'admin:read'])).toBe(true);
  });

  it('does not let an organization role satisfy an instance check', () => {
    expect(hasRole(user, 'admin')).toBe(false);
    expect(hasRole(user, 'admin:read')).toBe(false);
  });

  it('answers false for a missing user or roles', () => {
    expect(hasRole(null, 'user')).toBe(false);
    expect(hasRole({}, 'user')).toBe(false);
  });
});

describe('hasOrganizationRole', () => {
  it('matches organization roles exactly', () => {
    expect(hasOrganizationRole(user, 'admin')).toBe(true);
    expect(hasOrganizationRole(user, ['owner', 'admin'])).toBe(true);
    expect(hasOrganizationRole(user, 'owner')).toBe(false);
    expect(hasOrganizationRole(user, 'admin:read')).toBe(false);
    expect(
      hasOrganizationRole({ organizationRoles: ['admin:write'] }, 'admin:read')
    ).toBe(false);
  });

  it('does not let an instance role satisfy an organization check', () => {
    expect(
      hasOrganizationRole({ roles: ['admin'], organizationRoles: [] }, 'admin')
    ).toBe(false);
  });

  it('answers false for a missing user or an older API response', () => {
    expect(hasOrganizationRole(null, 'admin')).toBe(false);
    expect(hasOrganizationRole(olderApiUser, 'admin')).toBe(false);
  });
});
