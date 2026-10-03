import { validarEnv } from './env';

describe('validarEnv', () => {
  const minimo = { DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/solicitacoes' };

  it('aplica os valores padrão quando só o obrigatório é informado', () => {
    expect(validarEnv(minimo)).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      DATABASE_URL: minimo.DATABASE_URL,
      WEB_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'info',
    });
  });

  it('converte a porta recebida como texto', () => {
    expect(validarEnv({ ...minimo, PORT: '4000' }).PORT).toBe(4000);
  });

  it('recusa a ausência de DATABASE_URL', () => {
    expect(() => validarEnv({})).toThrow(/DATABASE_URL/);
  });

  it('recusa uma DATABASE_URL que não é do Postgres', () => {
    expect(() => validarEnv({ DATABASE_URL: 'mysql://localhost:3306/db' })).toThrow(/DATABASE_URL/);
  });

  it('recusa um nível de log desconhecido', () => {
    expect(() => validarEnv({ ...minimo, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
