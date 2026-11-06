/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

export default {
  displayName: 'client',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/../../jest.setup.ts'],
  transform: {
    '/node_modules/@seamless-auth/types/.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true } },
    ],
    '^.+\\.(t|j)sx?$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!@seamless-auth/types/)'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    // `@seamless-auth/types` ships ESM under the `import` condition alone, which
    // Jest's CommonJS resolver cannot read.
    '^@seamless-auth/types/permission/matching$':
      '<rootDir>/../../node_modules/@seamless-auth/types/dist/schemas/permission/matching.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/tests/**/*.(test|spec).[tj]s?(x)'],
};
