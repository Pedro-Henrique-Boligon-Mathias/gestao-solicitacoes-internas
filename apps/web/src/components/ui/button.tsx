import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Botão do shadcn/ui com os tokens Marinho: pílula, 40px (44px no login e no celular). */
const variantesBotao = cva(
  'rounded-pill inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-70 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:bg-muted',
        soft: 'bg-muted text-foreground hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground bg-transparent',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Só dentro do card de destaque marinho (anel de foco laranja)
        orange:
          'bg-brand-orange text-[#14213D] hover:bg-brand-orange/90 focus-visible:outline-brand-orange',
        hero: 'text-hero-foreground bg-transparent shadow-[inset_0_0_0_1px_rgb(255_255_255/35%)] hover:bg-white/10 focus-visible:outline-brand-orange',
      },
      size: {
        default: 'h-10 px-[18px]',
        sm: 'h-8 px-3.5 text-[13px]',
        lg: 'h-11 px-5 text-[15px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof variantesBotao> & { asChild?: boolean }) {
  const Componente = asChild ? Slot.Root : 'button';
  return <Componente className={cn(variantesBotao({ variant, size }), className)} {...props} />;
}
