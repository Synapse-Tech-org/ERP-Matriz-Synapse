import { Suspense } from "react";

import { PaginaBancoDeArquivos } from "@/components/banco-arquivos/pagina-banco-de-arquivos";

export default function BancoDeArquivos() {
  return <Suspense><PaginaBancoDeArquivos /></Suspense>;
}
