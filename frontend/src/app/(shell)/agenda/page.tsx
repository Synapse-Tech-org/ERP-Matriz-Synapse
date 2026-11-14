import { PaginaAgenda } from "@/components/agenda/pagina-agenda";
import { ExigeCapacidade } from "@/components/gestao/exige-capacidade";

function uuid(valor: string | string[] | undefined) {
  return typeof valor === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(valor) ? valor : undefined;
}

export default async function Agenda({ searchParams }: { searchParams: Promise<{ tag?: string | string[]; paciente?: string | string[] }> }) {
  const { tag, paciente } = await searchParams;
  const tagInicial = uuid(tag);
  const pacienteInicial = uuid(paciente);
  return <ExigeCapacidade capacidade="clientes.acessar">
    <PaginaAgenda key={JSON.stringify([tagInicial, pacienteInicial])} tagInicial={tagInicial} pacienteInicial={pacienteInicial} />
  </ExigeCapacidade>;
}
