'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TabelaAnalistas, type AnalistaGestao } from './tabela-analistas';

/** "Ver todos os N analistas": modal com a tabela completa (mesmos links das linhas). */
export function VerTodosAnalistas({ analistas }: { analistas: AnalistaGestao[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="soft" className="self-start">
          Ver todos os {analistas.length} analistas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Todos os analistas</DialogTitle>
          <DialogDescription>
            Os mais carregados primeiro · cada linha abre a lista filtrada
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <TabelaAnalistas analistas={analistas} cartoes={false} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
