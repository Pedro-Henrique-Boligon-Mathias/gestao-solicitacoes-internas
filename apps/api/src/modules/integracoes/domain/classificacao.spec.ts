import { classificarResposta } from './classificacao';

describe('ADR-010: classificarResposta (resultado de cada tentativa de envio)', () => {
  it.each([200, 201, 202, 204, 299])('ADR-010: HTTP %i → SUCESSO', (status) => {
    expect(classificarResposta(status)).toBe('SUCESSO');
  });

  it('ADR-010: sem resposta (erro de rede ou tempo esgotado) → TRANSITORIO', () => {
    expect(classificarResposta(null)).toBe('TRANSITORIO');
  });

  it.each([500, 502, 503, 504, 599])('ADR-010: HTTP %i (5xx) → TRANSITORIO', (status) => {
    expect(classificarResposta(status)).toBe('TRANSITORIO');
  });

  it.each([408, 429])(
    'ADR-010: HTTP %i → TRANSITORIO (o servidor pede para tentar de novo)',
    (status) => {
      expect(classificarResposta(status)).toBe('TRANSITORIO');
    },
  );

  it.each([400, 401, 403, 404, 405, 409, 410, 413, 415, 422, 451, 499])(
    'ADR-010: HTTP %i (outro 4xx) → PERMANENTE',
    (status) => {
      expect(classificarResposta(status)).toBe('PERMANENTE');
    },
  );
});
