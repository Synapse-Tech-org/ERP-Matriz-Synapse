"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { chaveDoDiaLocal, horaLocal, horariosDeAdiamento } from "@/lib/suporte/agenda-de-datas";

import estilos from "./agenda-recursos-v2.module.css";

interface Rotulos {
  emUmaHora: string;
  hojeAs17: string;
  amanhaAs9: string;
  segundaAs8: string;
  emTresDias: string;
}

export function AtalhosDeHorario({ rotulos, agendamento, valor, onChange }: {
  rotulos: Rotulos;
  agendamento?: boolean;
  valor: string;
  onChange: (valor: string) => void;
}) {
  const [agora] = useState(() => Date.now());
  const { hora, amanha, segunda } = horariosDeAdiamento(agora);
  const hoje = new Date(agora);
  hoje.setHours(17, 0, 0, 0);
  const tresDias = new Date(amanha);
  tresDias.setDate(tresDias.getDate() + 2);
  const opcoes = [
    ...(!agendamento ? [{ rotulo: rotulos.emUmaHora, data: hora }] : []),
    { rotulo: rotulos.hojeAs17, data: hoje },
    { rotulo: rotulos.amanhaAs9, data: amanha },
    { rotulo: rotulos.segundaAs8, data: segunda },
    ...(agendamento ? [{ rotulo: rotulos.emTresDias, data: tresDias }] : []),
  ];
  return <div className={estilos.atalhos}>
    {opcoes.map(({ rotulo, data }) => {
      const dataLocal = chaveDoDiaLocal(data) + "T" + horaLocal(data);
      return <Button key={rotulo} type="button" size="sm" variant="outline"
        aria-pressed={valor === dataLocal} disabled={agendamento && data.getTime() <= agora}
        onClick={() => onChange(dataLocal)}>{rotulo}</Button>;
    })}
  </div>;
}
