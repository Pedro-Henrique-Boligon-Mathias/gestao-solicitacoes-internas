// Roda em cada arquivo de teste de integração, antes dos imports.
// DATABASE_URL e MIGRATION_DATABASE_URL já vêm do setup global (container de testes).
import { SEGREDO_JWT_TESTE } from '../apoio/jwt';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = SEGREDO_JWT_TESTE;
