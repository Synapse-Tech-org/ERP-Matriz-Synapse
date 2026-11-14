"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTextos } from "@/lib/config/textos-provider";
import { baixarAnexoFeedback } from "@/lib/feedbacks/api";

export function AnexoFeedback({ id, nome }: { id: string; nome: string }) {
  const textos = useTextos().feedbacks.anexo;
  const [estado, setEstado] = useState<"ocioso" | "baixando" | "erro">("ocioso");

  async function baixar() {
    setEstado("baixando");
    try {
      await baixarAnexoFeedback(id, nome);
      setEstado("ocioso");
    } catch {
      setEstado("erro");
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" className="max-w-full"
        disabled={estado === "baixando"} onClick={() => void baixar()}>
        <Paperclip aria-hidden /><span className="truncate">{nome}</span>
      </Button>
      {estado === "erro" && <p role="alert" className="text-sm text-destructive">{textos?.falhaDownload}</p>}
    </div>
  );
}
