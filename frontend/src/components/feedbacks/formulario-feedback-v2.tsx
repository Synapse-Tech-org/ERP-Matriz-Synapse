import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import { Bug, CircleCheck, ImagePlus, Info, Lightbulb, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { useTextos } from "@/lib/config/textos-provider";
import type { AreaFeedback, TipoFeedback } from "@/lib/feedbacks/types";

import estilos from "./feedbacks-v2.module.css";

type TextosFeedbacks = ReturnType<typeof useTextos>["feedbacks"];

type Props = {
  textos: TextosFeedbacks;
  tipo: TipoFeedback;
  onTipo: (tipo: TipoFeedback) => void;
  area: AreaFeedback | "";
  onArea: (area: AreaFeedback) => void;
  areas: ReadonlyArray<{ valor: AreaFeedback; rotulo: string }>;
  descricao: string;
  onDescricao: (descricao: string) => void;
  limite: number;
  arquivo: File | null;
  onEscolherArquivo: (evento: ChangeEvent<HTMLInputElement>) => void;
  onRemoverArquivo: () => void;
  erroAnexo: boolean;
  enviando: boolean;
  validacao: boolean;
  erro: boolean;
  enviado: boolean;
  onSubmit: (evento: FormEvent<HTMLFormElement>) => void;
};

const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;

/** Formulário em passos do protótipo. Estado, validação e envio continuam na página. */
export function FormularioFeedbackV2({
  textos, tipo, onTipo, area, onArea, areas, descricao, onDescricao, limite, arquivo,
  onEscolherArquivo, onRemoverArquivo, erroAnexo, enviando, validacao, erro, enviado, onSubmit,
}: Props) {
  const v2 = textos.v2;
  const pronto = Boolean(area) && descricao.trim().length > 0;
  const tipos = [
    { valor: "SUGESTAO", rotulo: textos.tipos.sugestao, apoio: v2.descricaoSugestao, Icone: Lightbulb, cor: "var(--primary)" },
    { valor: "ERRO", rotulo: textos.tipos.erro, apoio: v2.descricaoErro, Icone: Bug, cor: "var(--destructive)" },
  ] as const;

  return (
    <form className={estilos.cartao} onSubmit={onSubmit}>
      <div className={estilos.corpo}>
        <fieldset>
          <legend className={estilos.passo}><span className={estilos.numero} data-feito="true" aria-hidden>1</span>{v2.perguntaTipo}</legend>
          <div className={`${estilos.conteudo} ${estilos.tipos}`}>
            {tipos.map(({ valor, rotulo, apoio, Icone, cor }) => (
              <button key={valor} type="button" className={estilos.tipo} style={tom(cor)} aria-pressed={tipo === valor} onClick={() => onTipo(valor)}>
                <span><Icone aria-hidden /></span>
                <span className="min-w-0"><strong>{rotulo}</strong><small>{apoio}</small></span>
                <span className={estilos.radio} aria-hidden />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-[26px]">
          <legend className={estilos.passo}><span className={estilos.numero} data-feito={Boolean(area)} aria-hidden>2</span>{v2.perguntaArea}</legend>
          <div className={`${estilos.conteudo} ${estilos.areas}`}>
            {areas.map((opcao) => (
              <button key={opcao.valor} type="button" aria-pressed={area === opcao.valor} onClick={() => onArea(opcao.valor)}>{opcao.rotulo}</button>
            ))}
          </div>
        </fieldset>

        <label className={`${estilos.passo} mt-[26px]`} htmlFor="feedback-descricao">
          <span className={estilos.numero} data-feito={descricao.trim().length > 0} aria-hidden>3</span>{v2.perguntaDescricao}
        </label>
        <div className={estilos.conteudo}>
          <textarea
            id="feedback-descricao"
            required
            maxLength={limite}
            rows={7}
            value={descricao}
            placeholder={textos.descricaoPlaceholder}
            aria-describedby="feedback-limite feedback-mensagem"
            onChange={(evento) => onDescricao(evento.target.value)}
          />
          <p id="feedback-limite" className={estilos.limite}>
            {textos.limite.replace("{atual}", String(descricao.length)).replace("{maximo}", String(limite))}
          </p>
        </div>

        {textos.anexo && (
          <>
            <p className={`${estilos.passo} mt-[22px]`}>
              <span className={estilos.numero} data-feito={Boolean(arquivo)} aria-hidden>4</span>{textos.anexo.titulo}<small>· {v2.opcional}</small>
            </p>
            <div className={estilos.conteudo}>
              {arquivo ? (
                <div className={estilos.arquivo}>
                  <ImagePlus className="size-5 flex-none text-muted-foreground" aria-hidden />
                  <span>{arquivo.name}</span>
                  <Button type="button" size="sm" variant="ghost" disabled={enviando} onClick={onRemoverArquivo}>{textos.anexo.remover}</Button>
                </div>
              ) : (
                <label className={estilos.soltar}>
                  <input className="sr-only" type="file" accept="image/png,image/jpeg" disabled={enviando} onChange={onEscolherArquivo} />
                  <ImagePlus aria-hidden />
                  <span><strong>{v2.escolherImagem}</strong><small>{textos.anexo.formatos}</small></span>
                </label>
              )}
              {erroAnexo && <p role="alert" className="mt-2 text-sm text-destructive">{textos.anexo.erro}</p>}
            </div>
          </>
        )}

        <div id="feedback-mensagem" aria-live="polite" className={estilos.mensagens}>
          {validacao && <p className="text-destructive">{textos.obrigatorio}</p>}
          {erro && <p className="text-destructive">{textos.erro}</p>}
          {enviado && <p className="text-cor-sucesso">{textos.sucesso}</p>}
        </div>
      </div>

      <div className={estilos.rodape}>
        {pronto ? <CircleCheck data-pronto="true" aria-hidden /> : <Info aria-hidden />}
        <span>{pronto ? v2.pronto : v2.faltaPreencher}</span>
        <Button type="submit" data-slot="lista-v2-acao" disabled={enviando}>
          <Send aria-hidden />{enviando ? textos.enviando : textos.enviar}
        </Button>
      </div>
    </form>
  );
}
