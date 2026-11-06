/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

export default {
  displayName: 'angular',
  preset: 'jest-preset-angular',
  // The preset's own jsdom environment predates the fetch globals; the
  // workspace's newer one is what the other projects run in.
  testEnvironment: '<rootDir>/../../node_modules/jest-environment-jsdom',
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  transform: {
    '/node_modules/@seamless-auth/types/.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true } },
    ],
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      { tsconfig: '<rootDir>/tsconfig.spec.json', stringifyContentPathRegex: '\\.html$' },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|@seamless-auth/types/))'],
  moduleNameMapper: {
    // `@seamless-auth/types` ships ESM under the `import` condition alone, which
    // Jest's CommonJS resolver cannot read.
    '^@seamless-auth/types/permission/matching$':
      '<rootDir>/../../node_modules/@seamless-auth/types/dist/schemas/permission/matching.js',
    // Tests run against the sources, so a change in the core is exercised here
    // without a build in between.
    '^@seamless-auth/angular$': '<rootDir>/src/index.ts',
    '^@seamless-auth/angular/routes$': '<rootDir>/routes/src/index.ts',
    '^@seamless-auth/client$': '<rootDir>/../client/src/index.ts',
  },
  testMatch: ['<rootDir>/tests/**/*.(test|spec).ts'],
  // ng-packagr writes a second package.json named @seamless-auth/angular here.
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
