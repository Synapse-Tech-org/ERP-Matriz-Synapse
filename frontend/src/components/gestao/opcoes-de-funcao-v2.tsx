"use client";

import { useId } from "react";
import { CircleCheck } from "lucide-react";

import type { PapelGerenciavel } from "@/lib/equipe/types";
import type { Papel } from "@/lib/gestao/types";

import { ICONE_DO_PAPEL, type TextosGestao } from "./apoio";
import visual from "./gestao-v2.module.css";

export function OpcoesDeFuncaoV2({
  textos, opcoes, valor, onChange, desabilitado, descricao, horizontal,
}: {
  textos: TextosGestao;
  opcoes: readonly PapelGerenciavel[];
  valor: Papel;
  onChange: (papel: PapelGerenciavel) => void;
  desabilitado?: boolean;
  descricao?: string;
  horizontal?: boolean;
}) {
  const id = useId();

  return <fieldset disabled={desabilitado} className={visual.opcoesFuncao}>
    <legend>{textos.formulario.funcao}</legend>
    {descricao && <p>{descricao}</p>}
    <div data-horizontal={horizontal || undefined}>
      {opcoes.map((papel) => {
        const Icone = ICONE_DO_PAPEL[papel];
        return <label key={papel} data-papel={papel}>
          <input className="sr-only" type="radio" name={id} value={papel} checked={papel === valor}
            onChange={() => onChange(papel)} />
          <span aria-hidden className={visual.iconeOpcao}><Icone className="size-[18px]" />
            {papel === valor && <CircleCheck aria-hidden className="size-[17px] text-[#1f5fd6]" />}
          </span>
          <strong>{textos.papeis[papel]}</strong>
          <small>{textos.v2.perfisDescricaoCurta[papel]}</small>
        </label>;
      })}
    </div>
  </fieldset>;
}
