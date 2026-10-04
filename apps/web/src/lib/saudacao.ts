/** Saudação pela hora de Brasília ("Bom dia", "Boa tarde" ou "Boa noite"). */
export function saudacao(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Sao_Paulo',
    }).format(agora),
  );
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}
