import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entradaSaida, gestao, gestaoHoje, type BaldeSerie, type Gestao } from '@/test/fabricas';
import { EntradaSaida } from './entrada-saida';

/*
 * "Entrada e saída" do painel de gestão (Fase 3.5, PR 4C): responde se a fila cresce ou diminui.
 * Três blocos (Entraram, Saíram, Saldo da fila) com selo de variação contra a janela anterior;
 * pares de pílulas por dia/semana num gráfico com role="img" e a descrição de todos os valores;
 * ao lado, tempo médio até a decisão, a mais antiga na fila e a prioridade das que entraram.
 * Em Hoje não há gráfico nem comparação: aparece a frase com os pendentes por prioridade.
 */

/** 04/10/2026 09:42 em São Paulo. */
const AGORA = new Date('2026-10-04T12:42:00.000Z');

function renderizar(painel: Gestao = gestao()) {
  render(<EntradaSaida dados={painel.entradaSaida} periodo={painel.periodo} />);
  const titulo = screen.getByRole('heading', { name: /^Entrada e saída/ });
  return (titulo.closest('section') ?? titulo.parentElement)!;
}

/** O bloco (Entraram, Saíram, Saldo da fila): um role="group" com o rótulo como nome. */
const bloco = (secao: HTMLElement, rotulo: RegExp) =>
  within(secao).getByRole('group', { name: rotulo });

const grafico = () => screen.queryByRole('img', { name: /Entrada e saída|entraram/i });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RF-04: Entrada e saída em "Últimos 7 dias"', () => {
  it('RF-04: o subtítulo diz o período, o intervalo e a granularidade', () => {
    const secao = renderizar();

    expect(secao).toHaveTextContent(/Últimos 7 dias \(27\/09 a 04\/10\), por dia/);
  });

  it('RF-04: três blocos com entraram, saíram (aprovadas · rejeitadas) e o saldo com sinal', () => {
    const secao = renderizar();

    expect(bloco(secao, /^Entraram$/)).toHaveTextContent('12');
    const sairam = bloco(secao, /^Saíram/);
    expect(sairam).toHaveTextContent('10');
    expect(sairam).toHaveTextContent('7 aprovadas · 3 rejeitadas');
    expect(bloco(secao, /^Saldo da fila$/)).toHaveTextContent('+2');
  });

  it('RF-04: selos de variação contra os 7 dias antes (+3 entraram, +1 saíram)', () => {
    const secao = renderizar();

    expect(bloco(secao, /^Entraram$/)).toHaveTextContent('+3 vs. 7 dias antes');
    expect(bloco(secao, /^Saíram/)).toHaveTextContent('+1 vs. 7 dias antes');
  });

  it('RF-04: variação negativa aparece com o sinal de menos', () => {
    const secao = renderizar(
      gestao({
        entradaSaida: entradaSaida({
          anterior: { entraram: 14, sairam: 9, tempoMedioDecisaoDias: 12 },
        }),
      }),
    );

    expect(bloco(secao, /^Entraram$/)).toHaveTextContent(/[−-]2 vs\. 7 dias antes/);
  });

  it('RF-04: em "Últimos 30 dias" a comparação é "vs. 30 dias antes"', () => {
    const base = gestao();
    const secao = renderizar(
      gestao({ periodo: { ...base.periodo, valor: '30d', granularidade: 'semana' } }),
    );

    expect(bloco(secao, /^Entraram$/)).toHaveTextContent('+3 vs. 30 dias antes');
  });

  it('RF-04: saldo positivo → selo "a fila cresceu"', () => {
    const secao = renderizar();

    expect(bloco(secao, /^Saldo da fila$/)).toHaveTextContent('a fila cresceu');
  });

  it.each([0, -3])('RF-04: saldo %i → sem o selo "a fila cresceu"', (saldo) => {
    const secao = renderizar(gestao({ entradaSaida: entradaSaida({ saldo }) }));

    expect(secao).not.toHaveTextContent('a fila cresceu');
  });
});

describe('RF-04: gráfico de Entrada e saída', () => {
  it('RF-04: em 7 dias, um gráfico role="img" descreve os 8 dias com entraram e saíram', () => {
    renderizar();

    const img = grafico();
    expect(img).toBeInTheDocument();
    const descricao = img!.getAttribute('aria-label') ?? '';
    const dias = ['27/09', '28/09', '29/09', '30/09', '01/10', '02/10', '03/10', '04/10'];
    const valores = gestao().entradaSaida.serie;
    dias.forEach((dia, i) => {
      const { entraram, sairam } = valores[i]!;
      expect(descricao).toContain(`${dia}: ${entraram} entraram, ${sairam} saíram`);
    });
    expect(descricao.match(/entraram/g)).toHaveLength(8);
  });

  it('RF-04: por semana, cada balde é descrito pela data de início da semana', () => {
    const serie: BaldeSerie[] = [
      { inicio: '2026-09-14T03:00:00.000Z', entraram: 7, sairam: 5 },
      { inicio: '2026-09-21T03:00:00.000Z', entraram: 7, sairam: 9 },
      { inicio: '2026-09-28T03:00:00.000Z', entraram: 11, sairam: 9 },
    ];
    const base = gestao();
    renderizar(
      gestao({
        periodo: { ...base.periodo, valor: '30d', granularidade: 'semana' },
        entradaSaida: entradaSaida({ serie }),
      }),
    );

    const descricao = grafico()!.getAttribute('aria-label') ?? '';
    expect(descricao).toMatch(/14\/09[^,]*: 7 entraram, 5 saíram/);
    expect(descricao).toMatch(/21\/09[^,]*: 7 entraram, 9 saíram/);
    expect(descricao).toMatch(/28\/09[^,]*: 11 entraram, 9 saíram/);
  });

  it('RF-04: sem movimento no período → "Sem movimento no período" e sem gráfico', () => {
    const zerada = gestao().entradaSaida.serie.map((b) => ({ ...b, entraram: 0, sairam: 0 }));
    const secao = renderizar(
      gestao({
        entradaSaida: entradaSaida({
          entraram: 0,
          sairam: 0,
          aprovadas: 0,
          rejeitadas: 0,
          saldo: 0,
          tempoMedioDecisaoDias: null,
          prioridadeEntraram: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
          serie: zerada,
        }),
      }),
    );

    expect(secao).toHaveTextContent('Sem movimento no período');
    expect(grafico()).toBeNull();
  });
});

describe('RF-04: indicadores ao lado do gráfico', () => {
  it('RF-04: tempo médio até a decisão, com o valor anterior quando cai', () => {
    const secao = renderizar();

    const tempo = within(secao).getByRole('group', { name: /^Tempo médio até a decisão/ });
    expect(tempo).toHaveTextContent('10 dias');
    expect(tempo).toHaveTextContent('12 dias vs. antes');
  });

  it('RF-04: sem decisões no período, o tempo médio fica em "—"', () => {
    const secao = renderizar(
      gestao({ entradaSaida: entradaSaida({ tempoMedioDecisaoDias: null }) }),
    );

    const tempo = within(secao).getByRole('group', { name: /^Tempo médio até a decisão/ });
    expect(tempo).toHaveTextContent('—');
    expect(tempo).not.toHaveTextContent('0 dias');
  });

  it('RF-04: a mais antiga na fila mostra há quantos dias espera, o código e a área', () => {
    const secao = renderizar();

    const antiga = within(secao).getByRole('group', { name: /^Mais antiga na fila/ });
    expect(antiga).toHaveTextContent('30 dias');
    expect(antiga).toHaveTextContent('SOL-000009 · Recursos Humanos');
  });

  it('RF-04: prioridade das que entraram, com número e percentual', () => {
    const secao = renderizar();

    const prioridade = within(secao).getByRole('group', { name: /^Prioridade das que entraram/ });
    expect(prioridade).toHaveTextContent(/Alta\s*6 · 50%/);
    expect(prioridade).toHaveTextContent(/Média\s*4 · 33%/);
    expect(prioridade).toHaveTextContent(/Baixa\s*2 · 17%/);
  });
});

describe('RF-04: Entrada e saída em "Hoje" e em "Tudo"', () => {
  it('RF-04: em Hoje não há gráfico nem selo de variação', () => {
    const secao = renderizar(gestaoHoje());

    expect(grafico()).toBeNull();
    expect(secao).not.toHaveTextContent(/vs\. .* antes/);
    expect(bloco(secao, /^Entraram$/)).toHaveTextContent('0');
  });

  it('RF-04: em Hoje aparece a frase dos pendentes agora (17) e a prioridade dos pendentes', () => {
    const secao = renderizar(gestaoHoje());

    expect(secao).toHaveTextContent(/Pendentes agora:? 17/);
    const pendentes = within(secao).getByRole('group', {
      name: /^Pendentes agora, por prioridade/,
    });
    expect(pendentes).toHaveTextContent(/Alta\s*6 · 35%/);
    expect(pendentes).toHaveTextContent(/Média\s*7 · 41%/);
    expect(pendentes).toHaveTextContent(/Baixa\s*4 · 24%/);
    expect(within(secao).queryByRole('group', { name: /^Prioridade das que entraram/ })).toBeNull();
  });

  it('RF-04: em Tudo não há comparação; o subtítulo diz "Tudo" e a granularidade', () => {
    const base = gestao();
    const secao = renderizar(
      gestao({
        periodo: { valor: 'tudo', inicio: null, fim: base.periodo.fim, granularidade: 'semana' },
        entradaSaida: entradaSaida({ anterior: null }),
      }),
    );

    expect(secao).toHaveTextContent(/Tudo.*por semana/);
    expect(secao).not.toHaveTextContent(/vs\. .* antes/);
    expect(grafico()).toBeInTheDocument();
  });

  it('RF-04: em Tudo com histórico longo, o subtítulo diz "por mês"', () => {
    const base = gestao();
    const secao = renderizar(
      gestao({
        periodo: { valor: 'tudo', inicio: null, fim: base.periodo.fim, granularidade: 'mes' },
        entradaSaida: entradaSaida({ anterior: null }),
      }),
    );

    expect(secao).toHaveTextContent(/por mês/);
  });
});
