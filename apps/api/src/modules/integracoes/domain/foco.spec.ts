import { eventoEmFoco } from './foco';
import type { StatusOutbox } from './tipos';

function eventos(...status: StatusOutbox[]) {
  return status.map((valor, indice) => ({ id: indice, status: valor }));
}

describe('ADR-010: eventoEmFoco', () => {
  it('ADR-010: sem eventos → null', () => {
    expect(eventoEmFoco([])).toBeNull();
  });

  it('ADR-010: todos ENVIADO → o mais recente, sem nada aguardando', () => {
    expect(eventoEmFoco(eventos('ENVIADO', 'ENVIADO'))).toEqual({
      evento: { id: 1, status: 'ENVIADO' },
      aguardando: 0,
    });
  });

  it('ADR-010: o mais antigo não enviado segura a fila; os não enviados depois dele aguardam', () => {
    expect(eventoEmFoco(eventos('ENVIADO', 'FALHOU', 'PENDENTE', 'FALHOU'))).toEqual({
      evento: { id: 1, status: 'FALHOU' },
      aguardando: 2,
    });
  });

  it('ADR-010: um único evento pendente → ele mesmo, aguardando 0', () => {
    expect(eventoEmFoco(eventos('PENDENTE'))).toEqual({
      evento: { id: 0, status: 'PENDENTE' },
      aguardando: 0,
    });
  });
});
