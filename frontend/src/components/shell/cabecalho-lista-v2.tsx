import Link from "next/link";

import { CentralDeAvisos } from "@/components/notificacoes/central-de-avisos";
import { IconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import { useTextos } from "@/lib/config/textos-provider";

export function CabecalhoListaV2({ titulo, grupo }: { titulo: string; grupo?: string }) {
  const { menu } = useTextos();

  return (
    <div data-slot="lista-v2-topo">
      <nav aria-label={titulo}>
        <Link href="/atendimentos" aria-label={menu.itens.atendimentos}>
          <IconeFrontendV2 nome="home-5-line" />
        </Link>
        <span aria-hidden>/</span>
        <span>{grupo ?? menu.grupoPrincipal}</span>
        <span aria-hidden>/</span>
        <span aria-current="page">{titulo}</span>
      </nav>
      <CentralDeAvisos />
    </div>
  );
}
