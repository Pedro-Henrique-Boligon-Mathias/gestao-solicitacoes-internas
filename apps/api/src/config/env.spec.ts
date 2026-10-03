import { validarEnv } from './env';

describe('RNF-03: validarEnv', () => {
  const minimo = {
    DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/solicitacoes',
    JWT_SECRET: 'x'.repeat(32),
  };

  it('RNF-03: aplica os valores padrão quando só o obrigatório é informado', () => {
    expect(validarEnv(minimo)).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      DATABASE_URL: minimo.DATABASE_URL,
      WEB_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'info',
      JWT_SECRET: minimo.JWT_SECRET,
      ACCESS_TOKEN_TTL: '15m',
      REFRESH_TOKEN_DIAS: 7,
      REFRESH_GRACA_SEGUNDOS: 10,
    });
  });

  it('RNF-03: converte a porta recebida como texto', () => {
    expect(validarEnv({ ...minimo, PORT: '4000' }).PORT).toBe(4000);
  });

  it('RNF-03: recusa a ausência de DATABASE_URL', () => {
    expect(() => validarEnv({ JWT_SECRET: minimo.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('RNF-03: recusa uma DATABASE_URL que não é do Postgres', () => {
    expect(() => validarEnv({ ...minimo, DATABASE_URL: 'mysql://localhost:3306/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('RNF-03: recusa um nível de log desconhecido', () => {
    expect(() => validarEnv({ ...minimo, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('RNF-03: JWT_SECRET ausente impede a subida', () => {
    expect(() => validarEnv({ DATABASE_URL: minimo.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('RNF-03: JWT_SECRET com menos de 32 caracteres impede a subida', () => {
    expect(() => validarEnv({ ...minimo, JWT_SECRET: 'x'.repeat(31) })).toThrow(/JWT_SECRET/);
  });

  it('RNF-03: converte REFRESH_TOKEN_DIAS e REFRESH_GRACA_SEGUNDOS recebidos como texto', () => {
    const env = validarEnv({
      ...minimo,
      ACCESS_TOKEN_TTL: '5m',
      REFRESH_TOKEN_DIAS: '3',
      REFRESH_GRACA_SEGUNDOS: '1',
    });
    expect(env).toMatchObject({
      ACCESS_TOKEN_TTL: '5m',
      REFRESH_TOKEN_DIAS: 3,
      REFRESH_GRACA_SEGUNDOS: 1,
    });
  });
});
