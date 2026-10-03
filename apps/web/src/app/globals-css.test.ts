import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Tokens da seção "Tokens para o código" da nota de identidade visual (paleta Marinho).
const TOKENS_CLARO: Record<string, string> = {
  '--primary': '#14213D',
  '--primary-foreground': '#FFFFFF',
  '--brand-orange': '#FCA311',
  '--brand-orange-strong': '#B86E00',
  '--hero': '#14213D',
  '--hero-foreground': '#FFFFFF',
  '--hero-muted': '#AEB8CC',
  '--background': '#EEF1F6',
  '--card': '#FFFFFF',
  '--tile': '#FFFFFF',
  '--muted': '#EEF1F6',
  '--foreground': '#0E1626',
  '--muted-foreground': '#4B5670',
  '--border': '#DFE3EB',
  '--input': '#7D879A',
  '--accent': '#E8ECF4',
  '--accent-foreground': '#14213D',
  '--link': '#2A4A8C',
  '--ring': '#14213D',
  '--status-aberta-bg': '#EAF1FE',
  '--status-aberta-fg': '#1D4ED8',
  '--status-aberta-dot': '#2563EB',
  '--status-analise-bg': '#FEF3C7',
  '--status-analise-fg': '#92400E',
  '--status-analise-dot': '#D97706',
  '--status-aprovada-bg': '#DCFCE7',
  '--status-aprovada-fg': '#166534',
  '--status-aprovada-dot': '#16A34A',
  '--status-rejeitada-bg': '#FEE2E2',
  '--status-rejeitada-fg': '#991B1B',
  '--status-rejeitada-dot': '#DC2626',
  '--priority-baixa': '#4B5563',
  '--priority-media': '#854D0E',
  '--priority-alta': '#9A3412',
  '--chart-alta': '#14213D',
  '--chart-media': '#14213D',
  '--chart-baixa': '#14213D',
  '--chart-alta-muted': '#B7C2D6',
  '--chart-media-muted': '#B7C2D6',
  '--chart-baixa-muted': '#B7C2D6',
  '--destructive': '#B91C1C',
  '--destructive-foreground': '#FFFFFF',
  '--warning-bg': '#FEF3C7',
  '--warning-fg': '#92400E',
  '--scrim': 'rgba(14,22,38,.45)',
};

const TOKENS_ESCURO: Record<string, string> = {
  '--primary': '#A9BCEB',
  '--primary-foreground': '#0A1120',
  '--brand-orange': '#FCA311',
  '--brand-orange-strong': '#FCA311',
  '--hero': '#1F3462',
  '--hero-foreground': '#FFFFFF',
  '--hero-muted': '#B9C4DB',
  '--background': '#070D19',
  '--card': '#111B30',
  '--tile': '#16223D',
  '--muted': '#18233B',
  '--foreground': '#E8ECF3',
  '--muted-foreground': '#9AA6BC',
  '--border': '#22304D',
  '--input': '#5D6B86',
  '--accent': '#1B2A4C',
  '--accent-foreground': '#C9D5F2',
  '--link': '#A9BCEB',
  '--ring': '#A9BCEB',
  '--status-aberta-bg': '#172340',
  '--status-aberta-fg': '#93B4FD',
  '--status-aberta-dot': '#60A5FA',
  '--status-analise-bg': '#33260A',
  '--status-analise-fg': '#FCD34D',
  '--status-analise-dot': '#F59E0B',
  '--status-aprovada-bg': '#0F2A1B',
  '--status-aprovada-fg': '#86EFAC',
  '--status-aprovada-dot': '#22C55E',
  '--status-rejeitada-bg': '#361414',
  '--status-rejeitada-fg': '#FCA5A5',
  '--status-rejeitada-dot': '#EF4444',
  '--priority-baixa': '#A1A1AA',
  '--priority-media': '#FDE047',
  '--priority-alta': '#FDBA74',
  '--chart-alta': '#FB923C',
  '--chart-media': '#FACC15',
  '--chart-baixa': '#A1A1AA',
  '--chart-alta-muted': '#FB923C',
  '--chart-media-muted': '#FACC15',
  '--chart-baixa-muted': '#A1A1AA',
  '--destructive': '#F87171',
  '--destructive-foreground': '#1A0A0A',
  '--warning-bg': '#33260A',
  '--warning-fg': '#FCD34D',
  '--scrim': 'rgba(0,0,0,.6)',
};

const RAIOS: Record<string, string> = {
  '--radius-pill': '999px',
  '--radius-card': '22px',
  '--radius-inner': '16px',
  '--radius-row': '14px',
  '--radius-field': '12px',
};

const FONTES = ['--font-display', '--font-sans', '--font-mono'];

const css = readFileSync(path.join(import.meta.dirname, 'globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Conteúdo entre as chaves do primeiro bloco cujo cabeçalho casa com `cabecalho`. */
function bloco(cabecalho: RegExp): string {
  const inicio = new RegExp(`(?:^|[\\n}])\\s*${cabecalho.source}\\s*\\{`).exec(css);
  if (!inicio) return '';
  let profundidade = 1;
  let fim = inicio.index + inicio[0].length;
  const abertura = fim;
  while (fim < css.length && profundidade > 0) {
    if (css[fim] === '{') profundidade++;
    if (css[fim] === '}') profundidade--;
    fim++;
  }
  return css.slice(abertura, fim - 1);
}

function declaracoes(conteudo: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const [, nome, valor] of conteudo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    mapa.set(nome!, valor!.trim());
  }
  return mapa;
}

/** Compara valores sem diferença de caixa, espaços ou zero à esquerda (".45" = "0.45"). */
function normalizar(valor: string | undefined): string | undefined {
  return valor
    ?.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(^|[^\d])\.(\d)/g, '$10.$2');
}

const raiz = declaracoes(bloco(/:root/));
const escuro = declaracoes(bloco(/\.dark/));
const tema = declaracoes(bloco(/@theme\s+inline/));

describe('ADR-013: tokens de cor, raio e fonte em globals.css', () => {
  it.each(Object.entries({ ...TOKENS_CLARO, ...RAIOS }))(
    'ADR-013: :root declara %s = %s',
    (token, valor) => {
      expect(normalizar(raiz.get(token))).toBe(normalizar(valor));
    },
  );

  it.each(FONTES)('ADR-013: :root declara %s', (token) => {
    expect(raiz.has(token)).toBe(true);
  });

  it.each(Object.entries(TOKENS_ESCURO))('ADR-013: .dark declara %s = %s', (token, valor) => {
    expect(normalizar(escuro.get(token))).toBe(normalizar(valor));
  });

  it.each(Object.keys(TOKENS_CLARO))(
    'ADR-013: @theme inline expõe %s como cor do Tailwind',
    (token) => {
      const nome = token.slice(2);
      expect(normalizar(tema.get(`--color-${nome}`))).toBe(`var(${token})`);
    },
  );

  it.each([...Object.keys(RAIOS), ...FONTES])('ADR-013: @theme inline expõe %s', (token) => {
    expect(tema.has(token)).toBe(true);
  });

  it('ADR-013: os tokens verdes provisórios (marca-*) foram removidos', () => {
    expect(css).not.toMatch(/--color-marca-/);
  });
});
