import { cn } from "@/lib/utils";

/** Marca um recurso que ainda não funciona nesta versão; o controle ao lado deve vir desabilitado. */
export function SeloEmBreve({ texto, className }: { texto: string; className?: string }) {
  return (
    <span
      data-slot="selo-em-breve"
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] text-[10.5px] font-semibold",
        "bg-[color-mix(in_srgb,var(--cor-ia)_9%,var(--card))] text-[var(--cor-ia)]",
        className,
      )}
    >
      {texto}
    </span>
  );
}
