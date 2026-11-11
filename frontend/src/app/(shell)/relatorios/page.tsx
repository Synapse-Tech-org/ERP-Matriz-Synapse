import { ExigeCapacidade } from "@/components/gestao/exige-capacidade";
import { PaginaRelatorioAtendimentos } from "@/components/relatorios/pagina-relatorio-atendimentos";

export default function RelatoriosPage() {
  return (
    <ExigeCapacidade capacidade="relatorios.ver">
      <PaginaRelatorioAtendimentos />
    </ExigeCapacidade>
  );
}
