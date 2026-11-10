import { MolduraGestaoV2 } from "@/components/shell/moldura-gestao-v2";
import { PaginaVisaoGeralAdministracao } from "@/components/administracao/pagina-visao-geral";

export default function Administracao() {
  return <MolduraGestaoV2 secao="administracao"><PaginaVisaoGeralAdministracao /></MolduraGestaoV2>;
}
