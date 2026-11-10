import { MolduraGestaoV2 } from "@/components/shell/moldura-gestao-v2";
import { Suspense } from "react";

import { PaginaGestao } from "@/components/gestao/pagina-gestao";

export default function Gestao() {
  return (
    <Suspense>
      <MolduraGestaoV2 secao="gestao"><PaginaGestao /></MolduraGestaoV2>
    </Suspense>
  );
}
