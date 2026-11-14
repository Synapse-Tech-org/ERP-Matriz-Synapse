import { PaginaAgendaConsultas } from "@/components/agenda-consultas/pagina-agenda-consultas";
import { ExigeCapacidade } from "@/components/gestao/exige-capacidade";

export default async function AgendaConsultas({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  return <ExigeCapacidade capacidade="clientes.acessar">
    <PaginaAgendaConsultas key={estado} canceladas={estado === "CANCELADO"} />
  </ExigeCapacidade>;
}
