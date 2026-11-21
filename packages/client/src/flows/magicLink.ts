/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import type {
  MessageResult,
  SeamlessAuthClient,
} from '../client/createSeamlessAuthClient';
import { SeamlessAuthError } from '../client/errors';
import type { SeamlessAuthResult } from '../client/result';
import type { AuthSessionActions } from '../session/createAuthSession';

/** The channel a verified link uses to tell the tab that asked for it. */
export const MAGIC_LINK_CHANNEL = 'seamless-auth';
export const MAGIC_LINK_SUCCESS_MESSAGE = 'MAGIC_LINK_AUTH_SUCCESS';
export const MAGIC_LINK_POLL_INTERVAL_MS = 5000;
export const MAGIC_LINK_RESEND_COOLDOWN_SECONDS = 30;

type MagicLinkDeps = {
  client: Pick<SeamlessAuthClient, 'checkMagicLink'>;
  refreshSession: AuthSessionActions['refreshSession'];
};

/**
 * Whether the emailed link has been used. The poll endpoint answers 204 while
 * the link is still unused, and only reports Success once it has been consumed.
 * A bare ok check would treat that 204 as completion and redirect before the
 * user clicks the link.
 */
export async function isMagicLinkComplete(
  client: Pick<SeamlessAuthClient, 'checkMagicLink'>
): Promise<boolean> {
  const { data, error } = await client.checkMagicLink();

  return !error && data?.message === 'Success';
}

/**
 * Watches for the link to be used, from the tab that asked for it: a message
 * from a tab in this browser that verified it, or a poll for one opened on
 * another device. Calls `onSignedIn` once, after the session is refreshed.
 * Returns a function that stops watching.
 */
export function watchMagicLink(
  deps: MagicLinkDeps & {
    onSignedIn: () => void;
    pollIntervalMs?: number;
  }
): () => void {
  let stopped = false;

  const complete = async () => {
    if (stopped || !(await isMagicLinkComplete(deps.client)) || stopped) {
      return;
    }

    stopped = true;
    await deps.refreshSession();
    deps.onSignedIn();
  };

  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(MAGIC_LINK_CHANNEL);

  if (channel) {
    channel.onmessage = event => {
      if (event.data?.type === MAGIC_LINK_SUCCESS_MESSAGE) {
        void complete().catch(() => undefined);
      }
    };
  }

  const interval = setInterval(() => {
    // A rejection inside a timer has no caller to surface it, so the poll
    // swallows unexpected errors and simply tries again on the next tick.
    void complete().catch(() => undefined);
  }, deps.pollIntervalMs ?? MAGIC_LINK_POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(interval);
    channel?.close();
  };
}

export type MagicLinkOutcome = 'signed-in' | 'elsewhere';

/** The platform family of the device that asked for a link. */
export type MagicLinkDeviceClass =
  | 'ios'
  | 'android'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'chromeos'
  | 'bot'
  | 'unknown';

/** Who asked for a link that `verifyMagicLink()` held for confirmation. */
export interface MagicLinkConfirmation {
  deviceClass: MagicLinkDeviceClass;
  /** ISO 8601 timestamp of the request. */
  requestedAt: string;
  /**
   * True when the API recognised this device as the one that asked for the
   * link. Newer APIs hold every link, so a client confirms these without
   * asking. Older APIs leave it out and only hold links opened elsewhere.
   */
  sameDevice?: boolean;
}

const DEVICE_LABELS: Record<MagicLinkDeviceClass, string> = {
  ios: 'an iPhone or iPad',
  android: 'an Android device',
  macos: 'a Mac',
  windows: 'a Windows PC',
  linux: 'a Linux computer',
  chromeos: 'a Chromebook',
  bot: 'an automated client',
  unknown: 'an unknown device',
};

function readConfirmation(body: unknown): MagicLinkConfirmation | undefined {
  if (typeof body !== 'object' || body === null) return undefined;

  const { error, requestedFrom, sameDevice } = body as {
    error?: unknown;
    requestedFrom?: unknown;
    sameDevice?: unknown;
  };
  if (error !== 'confirmation_required') return undefined;

  const from = (
    typeof requestedFrom === 'object' && requestedFrom !== null ? requestedFrom : {}
  ) as { deviceClass?: unknown; requestedAt?: unknown };

  return {
    deviceClass:
      typeof from.deviceClass === 'string' &&
      Object.prototype.hasOwnProperty.call(DEVICE_LABELS, from.deviceClass)
        ? (from.deviceClass as MagicLinkDeviceClass)
        : 'unknown',
    requestedAt: typeof from.requestedAt === 'string' ? from.requestedAt : '',
    ...(typeof sameDevice === 'boolean' ? { sameDevice } : {}),
  };
}

/**
 * Read a `verifyMagicLink()` failure that means the link was opened on a
 * device other than the one that asked for it. The link is still unused and
 * waits for `confirmMagicLink()`. Returns `undefined` for every other failure.
 *
 * As with the OAuth codes, a body a proxy nested under `details` is accepted.
 */
export function getMagicLinkConfirmation(
  error: unknown
): MagicLinkConfirmation | undefined {
  if (!(error instanceof SeamlessAuthError) || error.status !== 409) {
    return undefined;
  }

  return (
    readConfirmation(error.body) ??
    readConfirmation((error.body as { details?: unknown } | null)?.details)
  );
}

export function isMagicLinkConfirmationRequired(error: unknown): boolean {
  return getMagicLinkConfirmation(error) !== undefined;
}

/** A device class as a phrase, for example `a Mac`. */
export function describeMagicLinkDevice(deviceClass: MagicLinkDeviceClass): string {
  return DEVICE_LABELS[deviceClass] ?? DEVICE_LABELS.unknown;
}

/**
 * The sentence the bundled screens show above the confirmation buttons, with
 * the request time in the reader's locale. The time is left out when the API
 * sent one that does not parse.
 */
export function magicLinkConfirmationPrompt(
  confirmation: MagicLinkConfirmation,
  locales?: Intl.LocalesArgument
): string {
  const device = describeMagicLinkDevice(confirmation.deviceClass);
  const requestedAt = new Date(confirmation.requestedAt);

  if (!confirmation.requestedAt || Number.isNaN(requestedAt.getTime())) {
    return `A sign-in was requested from ${device}.`;
  }

  const when = requestedAt.toLocaleString(locales, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `A sign-in was requested from ${device} on ${when}.`;
}

/** The two values an emailed magic link carries. */
export interface MagicLinkParams {
  /** From the query (`?token=`). It finds the link. */
  token: string | null;
  /**
   * From the fragment (`#code=`), which never reaches a server, a Referer or an
   * access log. It proves the reader holds the whole link. Links from older
   * APIs carry none.
   */
  code: string | null;
}

function readParam(part: string, name: string): string | null {
  for (const pair of part.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (safeDecode(key) !== name) continue;

    const value = safeDecode(eq === -1 ? '' : pair.slice(eq + 1));
    return value ? value : null;
  }

  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * Read `token` from the query and `code` from the fragment of a magic link.
 * Takes a full URL (`https://...`, a universal link, or a custom scheme such
 * as `myapp://verify-magiclink?token=...#code=...`) or just the
 * `search`/`hash` of a location.
 *
 * It parses by hand rather than with `URL`, which some React Native runtimes
 * only partly implement and which does not parse every custom scheme.
 */
export function parseMagicLinkUrl(
  url: string | { search?: string; hash?: string }
): MagicLinkParams {
  let search: string;
  let hash: string;

  if (typeof url === 'string') {
    const hashAt = url.indexOf('#');
    hash = hashAt === -1 ? '' : url.slice(hashAt + 1);
    const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
    const queryAt = beforeHash.indexOf('?');
    search = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);
  } else {
    search = (url.search ?? '').replace(/^\?/, '');
    hash = (url.hash ?? '').replace(/^#/, '');
  }

  return { token: readParam(search, 'token'), code: readParam(hash, 'code') };
}

/**
 * Read the magic link this page was opened with, then take `token` and `code`
 * out of the address bar with `history.replaceState`, so neither reaches
 * history, a Referer or a script that reads the URL later. Call it as early as
 * the page allows, before analytics or other scripts run.
 *
 * Other query parameters and fragment values are kept. Outside a browser it
 * returns two nulls and does nothing.
 */
export function takeMagicLinkParams(): MagicLinkParams {
  if (typeof window === 'undefined' || !window.location) {
    return { token: null, code: null };
  }

  const { location, history } = window;
  const params = parseMagicLinkUrl(location);

  if (params.token === null && params.code === null) return params;

  const query = new URLSearchParams(location.search);
  query.delete('token');
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  fragment.delete('code');

  const search = query.toString();
  const hash = fragment.toString();
  const stripped = `${location.pathname}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;

  try {
    history.replaceState(history.state, '', stripped);
  } catch {
    // A sandboxed frame can refuse; the values were still read.
  }

  return params;
}

/** Where `verifyMagicLinkSignIn()` leaves a link. */
export type MagicLinkVerification =
  /** The link is used. Continue with `finishMagicLinkSignIn()`. */
  | { status: 'verified' }
  /** Opened on another device. Ask the reader, then `confirmMagicLinkSignIn()`. */
  | { status: 'confirmation-required'; confirmation: MagicLinkConfirmation }
  | { status: 'failed'; error: unknown };

/**
 * Verify an emailed link, the first step on the screen it lands on.
 *
 * Newer APIs hold every link until it is confirmed with the code from its
 * fragment. When they report the link was opened on the device that asked for
 * it, this confirms at once, so the reader is not asked about their own
 * request. Older APIs use the link on the verify call itself from that device,
 * which also ends here as `verified`.
 *
 * A link can be used once, so a screen that may mount twice has to reuse the
 * promise this returns rather than call it again.
 */
export async function verifyMagicLinkSignIn(deps: {
  client: Pick<SeamlessAuthClient, 'verifyMagicLink' | 'confirmMagicLink'>;
  token: string;
  code?: string | null;
}): Promise<MagicLinkVerification> {
  const verified = await deps.client.verifyMagicLink(deps.token);

  if (!verified.error) return { status: 'verified' };

  const confirmation = getMagicLinkConfirmation(verified.error);
  if (!confirmation) return { status: 'failed', error: verified.error };

  if (confirmation.sameDevice !== true) {
    return { status: 'confirmation-required', confirmation };
  }

  const confirmed = await deps.client.confirmMagicLink(
    deps.token,
    deps.code ?? undefined
  );

  return confirmed.error
    ? { status: 'failed', error: confirmed.error }
    : { status: 'verified' };
}

/**
 * Approve a link that `verifyMagicLink()` held for confirmation. The device
 * that asked for it is signed in through its own poll; this one is not, so on
 * success a screen tells the reader to go back to it.
 */
export async function confirmMagicLinkSignIn(deps: {
  client: Pick<SeamlessAuthClient, 'confirmMagicLink'>;
  token: string;
  /** The `code` from the link's fragment. Newer APIs require it. */
  code?: string | null;
}): Promise<SeamlessAuthResult<MessageResult>> {
  const result = await deps.client.confirmMagicLink(deps.token, deps.code ?? undefined);

  // The requesting tab may be in this browser after all (a changed network
  // address is enough to miss the device match), and is then told at once.
  if (!result.error && typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(MAGIC_LINK_CHANNEL);
    channel.postMessage({ type: MAGIC_LINK_SUCCESS_MESSAGE });
    channel.close();
  }

  return result;
}

/**
 * What the screen an emailed link lands on does once the link is verified.
 *
 * Verifying the link does not sign in this tab. The session belongs to the
 * browser that asked for the link, which collects it from `/magic-link/check`
 * with its pre-auth cookie. So this tells that tab, then signs in here too when
 * it can: when the link was opened in the same browser, which holds the same
 * pre-auth cookie. Opened on another device there is nothing to collect, and
 * the outcome is `elsewhere`.
 *
 * Call it only after `verifyMagicLinkSignIn()` reports `verified` (or, on an
 * older API, after `verifyMagicLink()` succeeds). When the link was opened on a
 * device other than the one that asked for it, verification reports
 * `confirmation-required` instead, and the flow continues with
 * `confirmMagicLinkSignIn()`.
 *
 * A link can be used once, so verification itself stays with the caller, which
 * has to make sure a remounted screen reuses the first request rather than
 * sending another.
 */
export async function finishMagicLinkSignIn(
  deps: MagicLinkDeps
): Promise<MagicLinkOutcome> {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(MAGIC_LINK_CHANNEL);
    channel.postMessage({ type: MAGIC_LINK_SUCCESS_MESSAGE });
    channel.close();
  }

  // Each successful check issues a session, so check only when this browser has
  // none yet: the requesting tab may already have collected it. In the
  // background, because an application that shows a loading screen while the
  // session is read would unmount the screen and verify again.
  let session = await deps.refreshSession({ background: true });

  if (session.error) {
    await deps.client.checkMagicLink();
    session = await deps.refreshSession({ background: true });
  }

  return session.error ? 'elsewhere' : 'signed-in';
}
