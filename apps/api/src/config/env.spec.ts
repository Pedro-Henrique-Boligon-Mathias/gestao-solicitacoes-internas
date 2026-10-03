import { validarEnv } from './env';

describe('RNF-03: validarEnv', () => {
  const minimo = { DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/solicitacoes' };

  it('RNF-03: aplica os valores padrão quando só o obrigatório é informado', () => {
    expect(validarEnv(minimo)).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      DATABASE_URL: minimo.DATABASE_URL,
      WEB_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'info',
    });
  });

  it('RNF-03: converte a porta recebida como texto', () => {
    expect(validarEnv({ ...minimo, PORT: '4000' }).PORT).toBe(4000);
  });

  it('RNF-03: recusa a ausência de DATABASE_URL', () => {
    expect(() => validarEnv({})).toThrow(/DATABASE_URL/);
  });

  it('RNF-03: recusa uma DATABASE_URL que não é do Postgres', () => {
    expect(() => validarEnv({ DATABASE_URL: 'mysql://localhost:3306/db' })).toThrow(/DATABASE_URL/);
  });

  it('RNF-03: recusa um nível de log desconhecido', () => {
    expect(() => validarEnv({ ...minimo, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
