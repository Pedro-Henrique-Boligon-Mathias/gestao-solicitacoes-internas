// Roda em cada arquivo de teste de integração, antes dos imports.
// DATABASE_URL e MIGRATION_DATABASE_URL já vêm do setup global (container de testes).
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
