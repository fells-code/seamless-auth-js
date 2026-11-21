/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { createSeamlessAuth } from '../src';
import { authGuard, guestGuard, requireAuth } from '../src/router';
import { createAdapter, signedIn, signedOut } from '../../../test-support/fakeAdapter';

const Page = defineComponent({ setup: () => () => h('p', 'page') });

const recovering = { body: { ...(signedIn.body as object), recovery: true } };

async function visitAll(session: typeof signedIn | typeof recovering, urls: string[]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page, beforeEnter: authGuard },
      { path: '/login', component: Page, beforeEnter: guestGuard },
      { path: '/denied', component: Page },
      { path: '/org', component: Page, beforeEnter: requireAuth({ roles: 'org:admin' }) },
      {
        path: '/admin',
        component: Page,
        beforeEnter: requireAuth({ roles: 'org:owner' }),
      },
      {
        path: '/billing',
        component: Page,
        beforeEnter: requireAuth({ roles: 'org:owner', forbiddenRedirectTo: '/denied' }),
      },
      { path: '/register-passkey', component: Page, beforeEnter: authGuard },
      { path: '/enroll', component: Page },
      {
        path: '/settings',
        component: Page,
        beforeEnter: requireAuth({ enrollmentRedirectTo: '/enroll' }),
      },
    ],
  });

  const adapter = createAdapter({ 'GET /users/me': session });
  mount(RouterView, {
    global: {
      plugins: [
        router,
        createSeamlessAuth({ apiHost: 'https://app.example.com', fetch: adapter.fetch }),
      ],
    },
  });

  const results: string[] = [];
  for (const url of urls) {
    await router.push(url);
    await flushPromises();
    results.push(router.currentRoute.value.fullPath);
  }
  return results;
}

describe('guards', () => {
  it('sends a signed-out visitor to the login screen after the session is read', async () => {
    expect(await visitAll(signedOut, ['/'])).toEqual(['/login']);
  });

  it('admits a signed-in user and keeps them off the login screen', async () => {
    expect(await visitAll(signedIn, ['/', '/login'])).toEqual(['/', '/']);
  });

  it('checks roles, scoped roles included', async () => {
    expect(await visitAll(signedIn, ['/org', '/billing', '/', '/admin'])).toEqual([
      '/org',
      '/denied',
      '/',
      '/',
    ]);
  });

  it('sends a recovery session to factor enrollment, roles or not', async () => {
    expect(await visitAll(recovering, ['/', '/org', '/billing'])).toEqual([
      '/register-passkey',
      '/register-passkey',
      '/register-passkey',
    ]);
  });

  it('admits a recovery session to a guarded enrollment route without looping', async () => {
    expect(await visitAll(recovering, ['/register-passkey'])).toEqual([
      '/register-passkey',
    ]);
  });

  it('takes the enrollment route from the guard options', async () => {
    expect(await visitAll(recovering, ['/settings'])).toEqual(['/enroll']);
  });
});
