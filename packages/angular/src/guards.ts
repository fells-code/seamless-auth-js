/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import { inject } from '@angular/core';
import {
  Router,
  type CanActivateFn,
  type CanMatchFn,
  type RouterStateSnapshot,
  type UrlSegment,
  type UrlTree,
} from '@angular/router';

import { SeamlessAuth } from './seamless-auth.service';

export interface RequireAuthOptions {
  /** Where to send someone who is signed out. Defaults to the configured `loginPath`. */
  redirectTo?: string;
  /**
   * Roles the user needs, matched the way the auth API matches them (scoped
   * roles such as `org:admin` included). Any one of a list is enough.
   */
  roles?: string | string[];
  /** Where to send a signed-in user without the role. Left out, navigation is refused. */
  forbiddenRedirectTo?: string;
  /**
   * Where to send a recovery session, which can do nothing but enroll a new
   * factor. Defaults to the configured `enrollmentPath`.
   */
  enrollmentRedirectTo?: string;
}

/** A guard usable as `canActivate`, `canActivateChild` or `canMatch`. */
export type SeamlessAuthGuard = CanActivateFn & CanMatchFn;

/**
 * The path a guard is deciding on: the whole URL for `canActivate`, and the
 * segments being matched for `canMatch`.
 */
function targetPath(target: RouterStateSnapshot | UrlSegment[] | undefined): string {
  if (Array.isArray(target)) {
    return `/${target.map(segment => segment.path).join('/')}`;
  }

  return (target?.url ?? '').split(/[?#]/)[0];
}

/**
 * Admits a signed-in user. Waits for the session to be read first, so a page
 * load on a protected route is not bounced to the login screen while the
 * session is still loading. A recovery session is sent to factor enrollment.
 */
export function requireAuth(options: RequireAuthOptions = {}): SeamlessAuthGuard {
  return async (
    _route: unknown,
    target?: RouterStateSnapshot | UrlSegment[]
  ): Promise<boolean | UrlTree> => {
    const auth = inject(SeamlessAuth);
    const router = inject(Router);
    const state = await auth.whenSettled();

    // A server render that was not handed the session cannot tell, and treats
    // the visitor as signed out: rendering the page could put its data in the
    // response. The browser decides again once the application boots there.
    if (state.loading || !state.isAuthenticated) {
      return router.parseUrl(options.redirectTo ?? auth.loginPath);
    }

    if (state.recoverySession) {
      const enrollment = router.parseUrl(
        options.enrollmentRedirectTo ?? auth.enrollmentPath
      );
      const enrollmentPath = router.serializeUrl(enrollment).split(/[?#]/)[0];

      // Guarding the enrollment route itself must not loop.
      return targetPath(target) === enrollmentPath ? true : enrollment;
    }

    if (options.roles !== undefined && !auth.hasScopedRole(options.roles)) {
      return options.forbiddenRedirectTo
        ? router.parseUrl(options.forbiddenRedirectTo)
        : false;
    }

    return true;
  };
}

/**
 * Admits someone who is signed out, and sends a signed-in user to the
 * configured `signedInPath`. For the sign-in screens.
 */
export function requireGuest(options: { redirectTo?: string } = {}): SeamlessAuthGuard {
  return async (): Promise<boolean | UrlTree> => {
    const auth = inject(SeamlessAuth);
    const router = inject(Router);
    const state = await auth.whenSettled();

    if (state.loading) {
      return true;
    }

    return state.isAuthenticated
      ? router.parseUrl(options.redirectTo ?? auth.signedInPath)
      : true;
  };
}

/** `requireAuth()` with its defaults. */
export const authGuard: SeamlessAuthGuard = requireAuth();

/** `requireGuest()` with its defaults. */
export const guestGuard: SeamlessAuthGuard = requireGuest();
