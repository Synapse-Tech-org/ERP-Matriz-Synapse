import type { ReactNode } from "react";

import estilos from "./lista-v2.module.css";

export function OpcoesListaV2<T extends string>({
  rotulo, valor, opcoes, onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: readonly { valor: T; rotulo: string; total?: number; icone?: ReactNode }[];
  onChange: (valor: T) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className={estilos.opcoes}>
      {opcoes.map((opcao) => (
        <button key={opcao.valor} type="button" aria-pressed={valor === opcao.valor} onClick={() => onChange(opcao.valor)}>
          {opcao.icone}{opcao.rotulo}
          {opcao.total !== undefined && <small>{opcao.total}</small>}
        </button>
      ))}
    </div>
  );
}
