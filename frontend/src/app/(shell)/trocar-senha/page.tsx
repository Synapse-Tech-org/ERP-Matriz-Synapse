import listaV2 from "@/components/shell/lista-v2.module.css";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import { cn } from "@/lib/utils";
import { TrocarSenhaForm } from "@/components/auth/trocar-senha-form";

export default function TrocarSenha() {
  return (
    <div className={cn(listaV2.pagina, listaV2.modulo, visual.paleta, "items-center px-4 py-8")}>
      <div className="m-auto w-full max-w-lg">
        <TrocarSenhaForm />
      </div>
    </div>
  );
}
