/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import { SeamlessAuthError } from '@seamless-auth/client';
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '@/AuthProvider';
import { useAuthClient } from '@/hooks/useAuthClient';
import { useLoginMethods } from '@/hooks/useLoginMethods';
import { usePasskeySupport } from '@/hooks/usePasskeySupport';
import PasskeyRegistration from '@/views/PassKeyRegistration';
import RecoveryCodes from '@/views/RecoveryCodes';

import {
  composite,
  contrastRatio,
  describeFailures,
  loadStylesheet,
  measureTextContrast,
  parseColor,
  resolveFallbacks,
  type Rgba,
} from './support/contrast';

jest.mock('@/AuthProvider');
jest.mock('@/hooks/useAuthClient');
jest.mock('@/hooks/usePasskeySupport');
jest.mock('@/hooks/useLoginMethods', () => ({
  ...jest.requireActual('@/hooks/useLoginMethods'),
  useLoginMethods: jest.fn(),
}));

// The OpenID Provider's hosted pages are built on these screens and hold them to
// WCAG 2.2 AA (fells-code/seamless-auth-js#230).
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const client = {
  registerPasskey: jest.fn(),
  getRecoveryCodeStatus: jest.fn(),
  generateRecoveryCodes: jest.fn(),
};
let recoverySession = false;

const success = <T,>(data: T) => ({ data, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  recoverySession = false;
  (useAuthClient as jest.Mock).mockReturnValue(client);
  (useAuth as jest.Mock).mockImplementation(() => ({
    refreshSession: jest.fn(),
    recoverySession,
    credentials: [],
    verifyStepUpWithPasskey: jest.fn(),
    verifyStepUpWithTotp: jest.fn(),
  }));
  (usePasskeySupport as jest.Mock).mockReturnValue({
    passkeySupported: true,
    loading: false,
  });
  (useLoginMethods as jest.Mock).mockReturnValue({
    loginMethods: ['passkey', 'magic_link'],
    loading: false,
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

const renderScreen = (element: React.ReactElement) =>
  render(<MemoryRouter initialEntries={['/']}>{element}</MemoryRouter>);

const axeViolations = async (container: Element) => {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: WCAG_AA_TAGS },
  });
  return results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`);
};

const expectAccessible = async (container: Element, stylesheet: string) => {
  expect(await axeViolations(container)).toEqual([]);
  expect(
    describeFailures(measureTextContrast(container, loadStylesheet(stylesheet)))
  ).toEqual([]);
};

describe('contrast helper', () => {
  it('matches the WCAG reference values', () => {
    const white = parseColor('white') as Rgba;
    const black = parseColor('#000') as Rgba;
    expect(contrastRatio(white, black)).toBe(21);
    expect(contrastRatio(white, white)).toBe(1);
    // The pairs reported in #230, as axe measured them.
    expect(contrastRatio(white, parseColor('#059669') as Rgba)).toBe(3.76);
    expect(
      contrastRatio(parseColor('#3b82f6') as Rgba, parseColor('#1f2937') as Rgba)
    ).toBe(3.99);
  });

  it('resolves custom properties to their fallbacks and composites alpha', () => {
    expect(resolveFallbacks('var(--a, var(--b, rgba(0, 0, 0, 0.5)))')).toBe(
      'rgba(0, 0, 0, 0.5)'
    );
    expect(composite([0, 0, 0, 0.5], [255, 255, 255, 1])).toEqual([
      127.5, 127.5, 127.5, 1,
    ]);
  });
});

describe('passkey enrollment meets WCAG 2.2 AA', () => {
  const stylesheet = 'registerPasskey.module.css';

  it('when the device supports passkeys', async () => {
    const { container } = renderScreen(<PasskeyRegistration />);
    await screen.findByText('Skip for now');
    await expectAccessible(container, stylesheet);
  });

  it('with an error message', async () => {
    client.registerPasskey.mockResolvedValueOnce({
      data: null,
      error: new Error('Failed to fetch passkey registration challenge.'),
    });
    const { container } = renderScreen(<PasskeyRegistration />);
    fireEvent.click(await screen.findByText('Register Passkey'));
    await screen.findByText(/Error registering passkey/i);
    await expectAccessible(container, stylesheet);
  });

  it('with a success message', async () => {
    client.registerPasskey.mockResolvedValueOnce(
      success({ credentialId: 'cred', prfCapable: false })
    );
    const { container } = renderScreen(<PasskeyRegistration />);
    fireEvent.click(await screen.findByText('Register Passkey'));
    await screen.findByText('Passkey registered successfully.');
    await expectAccessible(container, stylesheet);
  });

  it('during account recovery', async () => {
    recoverySession = true;
    const { container } = renderScreen(<PasskeyRegistration />);
    await screen.findByText('Use an authenticator app');
    await expectAccessible(container, stylesheet);
  });

  it('when the device does not support passkeys', async () => {
    (usePasskeySupport as jest.Mock).mockReturnValue({
      passkeySupported: false,
      loading: false,
    });
    const { container } = renderScreen(<PasskeyRegistration />);
    await screen.findByText('Passkeys are not available here');
    await expectAccessible(container, stylesheet);
  });

  it('while checking for support', async () => {
    (usePasskeySupport as jest.Mock).mockReturnValue({
      passkeySupported: false,
      loading: true,
    });
    const { container } = renderScreen(<PasskeyRegistration />);
    await screen.findByText('Checking for Passkey Support...');
    await expectAccessible(container, stylesheet);
  });
});

describe('recovery codes meet WCAG 2.2 AA', () => {
  const stylesheet = 'recovery.module.css';

  it('showing a new set, after copying it', async () => {
    client.getRecoveryCodeStatus.mockResolvedValue(
      success({ enabled: true, remaining: 0, total: 0, createdAt: null })
    );
    client.generateRecoveryCodes.mockResolvedValue(
      success({
        message: 'Success',
        codes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'],
        createdAt: 'x',
      })
    );
    const { container } = renderScreen(<RecoveryCodes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    await screen.findByRole('status');
    await expectAccessible(container, stylesheet);
  });

  it('offering a new set after a failure', async () => {
    client.getRecoveryCodeStatus.mockResolvedValue(
      success({ enabled: true, remaining: 0, total: 0, createdAt: null })
    );
    client.generateRecoveryCodes.mockResolvedValue({
      data: null,
      error: new SeamlessAuthError('failed', 500, {}),
    });
    const { container } = renderScreen(<RecoveryCodes />);
    await screen.findByRole('alert');
    await expectAccessible(container, stylesheet);
  });

  it('while preparing the codes', async () => {
    client.getRecoveryCodeStatus.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen(<RecoveryCodes />);
    await screen.findByText('Preparing your recovery codes...');
    await expectAccessible(container, stylesheet);
  });
});
