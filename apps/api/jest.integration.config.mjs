// Testes de integração: Postgres real via Testcontainers (requer Docker).
// Roda com node --experimental-vm-modules: o client do Prisma 7 usa import dinâmico.
// Um container para a execução inteira; arquivos em série para não disputarem o mesmo banco.
export default {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/test/integracao/**/*.int-spec.ts'],
  globalSetup: '<rootDir>/test/integracao/setup-global.ts',
  globalTeardown: '<rootDir>/test/integracao/teardown-global.ts',
  setupFiles: ['<rootDir>/test/integracao/setup-env.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  maxWorkers: 1,
  testTimeout: 60_000,
};
