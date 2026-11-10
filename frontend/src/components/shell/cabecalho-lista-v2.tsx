import Link from "next/link";

import { BuscaDoDashboard } from "@/components/dashboard/busca-do-dashboard";
import { CentralDeAvisos } from "@/components/notificacoes/central-de-avisos";
import { IconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import { useTextos } from "@/lib/config/textos-provider";

export function CabecalhoListaV2({ titulo, grupo, busca }: { titulo: string; grupo?: string; busca?: string }) {
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
      {busca ? <div className="flex min-w-0 items-center gap-2.5">
        <BuscaDoDashboard rotulo={busca} />
        <CentralDeAvisos />
      </div> : <CentralDeAvisos />}
    </div>
  );
}
