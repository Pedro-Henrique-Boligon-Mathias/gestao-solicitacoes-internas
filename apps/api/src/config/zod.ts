import { z } from 'zod';

// Mensagens padrão do zod em português (as mensagens próprias dos DTOs têm prioridade).
z.config(z.locales.pt());
