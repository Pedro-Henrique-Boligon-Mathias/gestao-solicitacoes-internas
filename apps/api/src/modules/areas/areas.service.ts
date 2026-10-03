import { Injectable } from '@nestjs/common';
import { ContextoBanco } from '../../database/contexto-banco';
import type { AreaDto } from './areas.dto';

/** Cadastro simples: sem regra de negócio, fala direto com o Prisma (areas fica fora da RLS). */
@Injectable()
export class AreasService {
  constructor(private readonly banco: ContextoBanco) {}

  listarAtivas(): Promise<AreaDto[]> {
    return this.banco.cliente.area.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    });
  }
}
