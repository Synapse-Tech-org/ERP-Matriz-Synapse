import { ExigeCapacidade } from "@/components/gestao/exige-capacidade";
import { RotaAutomacao } from "@/components/automacao/pagina-automacao";

export default function Automacao() {
  return (
    <ExigeCapacidade capacidade="automacao.ver">
      <RotaAutomacao />
    </ExigeCapacidade>
  );
}
