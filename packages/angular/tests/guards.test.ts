/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { authGuard, guestGuard, provideSeamlessAuth, requireAuth } from '../src';
import { createAdapter, signedIn, signedOut } from '../../../test-support/fakeAdapter';

@Component({ template: 'page' })
class Page {}

const recovering = { body: { ...(signedIn.body as object), recovery: true } };

function setup(session: typeof signedIn | typeof recovering, platform = 'browser') {
  const adapter = createAdapter({ 'GET /users/me': session });
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      provideSeamlessAuth({ apiHost: 'https://app.example.com', fetch: adapter.fetch }),
      provideRouter([
        { path: '', component: Page, canActivate: [authGuard] },
        {
          path: 'admin',
          component: Page,
          canMatch: [requireAuth({ roles: 'org:owner' })],
        },
        {
          path: 'billing',
          component: Page,
          canActivate: [
            requireAuth({ roles: 'org:owner', forbiddenRedirectTo: '/denied' }),
          ],
        },
        {
          path: 'org',
          component: Page,
          canActivate: [requireAuth({ roles: 'org:admin' })],
        },
        { path: 'login', component: Page, canActivate: [guestGuard] },
        { path: 'denied', component: Page },
        {
          path: 'custom',
          component: Page,
          canActivate: [requireAuth({ redirectTo: '/denied' })],
        },
        { path: 'register-passkey', component: Page, canActivate: [authGuard] },
        { path: 'enroll', component: Page },
        {
          path: 'setup',
          component: Page,
          canMatch: [requireAuth({ enrollmentRedirectTo: '/setup' })],
        },
        {
          path: 'settings',
          component: Page,
          canActivate: [requireAuth({ enrollmentRedirectTo: '/enroll' })],
        },
      ]),
    ],
  });
}

let harness: RouterTestingHarness | null = null;

beforeEach(() => {
  harness = null;
});

async function visit(url: string) {
  harness ??= await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return TestBed.inject(Router).url;
}

describe('guards', () => {
  it('sends a signed-out visitor to the login screen after the session is read', async () => {
    setup(signedOut);
    expect(await visit('/')).toBe('/login');
  });

  it('honours a custom redirect', async () => {
    setup(signedOut);
    expect(await visit('/custom')).toBe('/denied');
  });

  it('admits a signed-in user and keeps them off the login screen', async () => {
    setup(signedIn);
    expect(await visit('/')).toBe('/');
    expect(await visit('/login')).toBe('/');
  });

  it('does not hold a server render, and keeps protected pages out of it', async () => {
    setup(signedIn, 'server');
    // Without initialSession the server cannot know, so it renders as signed
    // out; the browser runs the guards again when the application boots there.
    expect(await visit('/')).toBe('/login');
    expect(await visit('/login')).toBe('/login');
  });

  it('checks roles, scoped roles included', async () => {
    setup(signedIn);
    expect(await visit('/org')).toBe('/org');
    expect(await visit('/billing')).toBe('/denied');
    // A refused canMatch leaves the URL unmatched, which is the point of it.
    await expect(visit('/admin')).rejects.toThrow(/NG04002/);
  });

  it('sends a recovery session to factor enrollment, roles or not', async () => {
    setup(recovering);
    expect(await visit('/')).toBe('/register-passkey');
    expect(await visit('/org')).toBe('/register-passkey');
    expect(await visit('/admin')).toBe('/register-passkey');
  });

  it('admits a recovery session to a guarded enrollment route without looping', async () => {
    setup(recovering);
    expect(await visit('/register-passkey')).toBe('/register-passkey');
  });

  it('takes the enrollment route from the guard options', async () => {
    setup(recovering);
    expect(await visit('/settings')).toBe('/enroll');
    // canMatch sees the URL segments rather than the router state.
    expect(await visit('/setup')).toBe('/setup');
  });
});
