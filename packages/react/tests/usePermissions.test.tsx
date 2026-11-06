/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { AuthProvider, useAuth } from '@/AuthProvider';
import { usePermissions } from '@/hooks/usePermissions';
import {
  createFetchTransport,
  createFetchWithAuth,
} from '../../client/src/fetchWithAuth';

jest.mock('../../client/src/fetchWithAuth');

const fetchWithAuth = jest.fn();
(createFetchWithAuth as jest.Mock).mockReturnValue(fetchWithAuth);
(createFetchTransport as jest.Mock).mockImplementation(() => ({
  fetch: fetchWithAuth,
  authorizedFetch: jest.fn(),
  mode: 'cookie',
  clearTokens: jest.fn(),
}));

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  phone: null,
  roles: ['user'],
  activeOrganizationId: 'org-1',
};

function respondWithUser(user: object | null) {
  fetchWithAuth.mockImplementation(async (path: string) =>
    path === 'users/me' && user
      ? { ok: true, json: async () => ({ user, credentials: [] }) }
      : { ok: false, status: 401, json: async () => ({ error: 'unauthenticated' }) }
  );
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider apiHost="https://api.example.com">{children}</AuthProvider>
);

async function renderSettled() {
  const view = renderHook(() => ({ permissions: usePermissions(), auth: useAuth() }), {
    wrapper,
  });
  await waitFor(() => expect(view.result.current.permissions.loading).toBe(false));
  return view;
}

describe('usePermissions', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset();
    window.localStorage.clear();
  });

  it('throws outside AuthProvider, as useAuth does', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => usePermissions())).toThrow(/AuthProvider/);

    consoleError.mockRestore();
  });

  it('reads permissions and roles from the current user', async () => {
    respondWithUser({
      ...baseUser,
      permissions: ['reports:read'],
      organizationRoles: ['admin'],
      organizationPermissions: ['projects:write'],
    });

    const { result } = await renderSettled();
    const permissions = result.current.permissions;

    expect(permissions.permissions).toEqual(['reports:read']);
    expect(permissions.organizationRoles).toEqual(['admin']);
    expect(permissions.organizationPermissions).toEqual(['projects:write']);
    expect(permissions.activeOrganizationId).toBe('org-1');

    expect(permissions.hasPermission('reports:read')).toBe(true);
    expect(permissions.hasPermission('reports:read', { scope: 'organization' })).toBe(
      false
    );
    expect(permissions.hasAllPermissions(['reports:read', 'projects:write'])).toBe(true);
    expect(permissions.hasOrganizationRole('admin')).toBe(true);
    expect(permissions.hasRole('admin')).toBe(false);
    expect(permissions.hasRole('user')).toBe(true);
  });

  it('answers false and leaves the fields undefined for an older API', async () => {
    respondWithUser(baseUser);

    const { result } = await renderSettled();
    const permissions = result.current.permissions;

    expect(permissions.permissions).toBeUndefined();
    expect(permissions.organizationRoles).toBeUndefined();
    expect(permissions.organizationPermissions).toBeUndefined();
    expect(permissions.hasPermission('reports:read')).toBe(false);
    expect(permissions.hasAllPermissions('reports:read')).toBe(false);
    expect(permissions.hasOrganizationRole('admin')).toBe(false);
  });

  it('answers false when signed out', async () => {
    respondWithUser(null);

    const { result } = await renderSettled();
    const permissions = result.current.permissions;

    expect(permissions.roles).toBeUndefined();
    expect(permissions.hasPermission('reports:read')).toBe(false);
    expect(permissions.hasRole('user')).toBe(false);
    expect(permissions.hasOrganizationRole('admin')).toBe(false);
  });

  it('keeps the same answer until the user is next refreshed', async () => {
    respondWithUser({ ...baseUser, permissions: ['reports:read'] });

    const { result } = await renderSettled();
    expect(result.current.permissions.hasPermission('reports:read')).toBe(true);

    respondWithUser({ ...baseUser, permissions: [] });
    expect(result.current.permissions.hasPermission('reports:read')).toBe(true);

    await act(async () => {
      await result.current.auth.refreshSession({ background: true });
    });

    expect(result.current.permissions.hasPermission('reports:read')).toBe(false);
  });

  it('keeps a stable result between renders with the same user', async () => {
    respondWithUser(baseUser);

    const { result, rerender } = await renderSettled();
    const first = result.current.permissions;

    rerender();

    expect(result.current.permissions).toBe(first);
  });

  it('lets an application gate UI on a permission', async () => {
    const Gate = () => {
      const { hasPermission } = usePermissions();
      return hasPermission('reports:read') ? <p>Reports</p> : <p>No access</p>;
    };

    respondWithUser({ ...baseUser, permissions: ['reports:read'] });
    render(<Gate />, { wrapper });

    expect(await screen.findByText('Reports')).toBeInTheDocument();
  });
});
