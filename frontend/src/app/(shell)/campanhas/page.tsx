import { MolduraGestaoV2 } from "@/components/shell/moldura-gestao-v2";
import { ExigeAcessoACampanhas } from "@/components/campanhas/exige-acesso-a-campanhas";
import { PaginaCampanhas } from "@/components/campanhas/pagina-campanhas";

export default function Campanhas() {
  return (
    <ExigeAcessoACampanhas>
      <MolduraGestaoV2 secao="campanhas"><PaginaCampanhas /></MolduraGestaoV2>
    </ExigeAcessoACampanhas>
  );
}
