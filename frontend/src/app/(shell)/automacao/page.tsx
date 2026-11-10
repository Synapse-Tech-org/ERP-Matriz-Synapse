import { MolduraGestaoV2 } from "@/components/shell/moldura-gestao-v2";
import { ExigeCapacidade } from "@/components/gestao/exige-capacidade";
import { PaginaAutomacao } from "@/components/automacao/pagina-automacao";

export default function Automacao() {
  return (
    <ExigeCapacidade capacidade="automacao.ver">
      <MolduraGestaoV2 secao="automacao"><PaginaAutomacao /></MolduraGestaoV2>
    </ExigeCapacidade>
  );
}
