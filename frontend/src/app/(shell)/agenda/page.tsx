import { PaginaAgenda } from "@/components/agenda/pagina-agenda";
import { ExigeCapacidade } from "@/components/gestao/exige-capacidade";

export default async function Agenda({ searchParams }: { searchParams: Promise<{ tag?: string | string[] }> }) {
  const { tag } = await searchParams;
  const tagInicial = typeof tag === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(tag) ? tag : undefined;
  return <ExigeCapacidade capacidade="clientes.acessar"><PaginaAgenda key={tagInicial} tagInicial={tagInicial} /></ExigeCapacidade>;
}
