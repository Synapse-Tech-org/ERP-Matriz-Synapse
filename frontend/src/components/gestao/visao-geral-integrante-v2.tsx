"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, ShieldCheck, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { recebeAtendimento } from "@/lib/equipe/papel";
import type { PapelGerenciavel, UsuarioEquipe } from "@/lib/equipe/types";
import { useEditarUsuario } from "@/lib/equipe/use-equipe";
import { CHAVE_GESTAO } from "@/lib/gestao/use-gestao";

import { preencher, type TextosGestao } from "./apoio";
import visual from "./gestao-v2.module.css";
import { OpcoesDeFuncaoV2 } from "./opcoes-de-funcao-v2";

export function VisaoGeralIntegranteV2({
  usuario, textos, funcoes, podeAlterarFuncao, avaliacao, atendimentos,
  quantidadeExcecoes, podeAlterarIa, onIa, onPermissoes, onSujoChange,
}: {
  usuario: UsuarioEquipe;
  textos: TextosGestao;
  funcoes: PapelGerenciavel[];
  podeAlterarFuncao: boolean;
  avaliacao?: { media: number; total: number };
  atendimentos?: number;
  quantidadeExcecoes: number;
  podeAlterarIa: boolean;
  onIa: (disponivel: boolean) => void;
  onPermissoes?: () => void;
  onSujoChange: (sujo: boolean) => void;
}) {
  const cache = useQueryClient();
  const editar = useEditarUsuario();
  const [rascunho, setRascunho] = useState<PapelGerenciavel | null>(null);
  const [salvo, setSalvo] = useState(false);
  const podeEditar = podeAlterarFuncao && usuario.ativo;
  const sujo = rascunho !== null && rascunho !== usuario.papel;
  const participaIa = recebeAtendimento(usuario.papel);
  const permissao = usuario.papel === "GESTOR" || usuario.papel === "ADMINISTRADOR"
    ? textos.equipe.permissoes.acessoTotal
    : quantidadeExcecoes > 0 ? textos.v2.personalizadas : textos.equipe.permissoes.padrao;

  function salvarFuncao() {
    if (!podeEditar || !sujo || !rascunho || editar.isPending) return;
    editar.mutate({ id: usuario.id, dados: { nome: usuario.nome, email: usuario.email, papel: rascunho } }, {
      onSuccess: () => {
        void cache.invalidateQueries({ queryKey: CHAVE_GESTAO });
        setRascunho(null);
        onSujoChange(false);
        setSalvo(true);
      },
    });
  }

  return <div className={visual.visaoPessoa}>
    <dl className={visual.indicadoresPessoa}>
      <div><dt>{textos.equipe.colunas.presenca}</dt><dd><i aria-hidden data-presenca={usuario.statusPresenca} />{textos.equipe.presenca[usuario.statusPresenca]}</dd></div>
      <div><dt>{textos.v2.avaliacaoMedia}</dt><dd>
        {avaliacao ? <><Star aria-hidden className="size-4 fill-[#e0a61c] text-[#e0a61c]" />
          {avaliacao.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}<small>({avaliacao.total})</small></>
          : textos.equipe.semAvaliacao}
      </dd></div>
      <div><dt>{textos.v2.atendimentos}</dt><dd>{atendimentos ?? "—"}</dd></div>
      <div className={visual.indicadorIa}>
        <div><dt>{textos.v2.rodizioIa}</dt><dd>{participaIa
          ? usuario.disponivelParaIa ? textos.equipe.ia.disponivel : textos.equipe.ia.indisponivel
          : textos.equipe.ia.naoAplicavel}</dd></div>
        {participaIa && <Switch checked={usuario.disponivelParaIa ?? false} disabled={!podeAlterarIa}
          aria-label={preencher(textos.equipe.ia.rotulo, { nome: usuario.nome })} onCheckedChange={onIa} />}
      </div>
    </dl>
    {podeEditar ? <OpcoesDeFuncaoV2 textos={textos} opcoes={funcoes} valor={rascunho ?? usuario.papel}
      descricao={textos.v2.funcaoDescricao} horizontal desabilitado={editar.isPending}
      onChange={(papel) => {
        setRascunho(papel);
        setSalvo(false);
        editar.reset();
        onSujoChange(papel !== usuario.papel);
      }} /> : <div>
      <p className="text-sm font-semibold">{textos.formulario.funcao}</p>
      <p className="text-sm text-[#6b7385]">{textos.papeis[usuario.papel]}</p>
    </div>}
    {editar.isError && <p role="alert" className="text-sm text-destructive">{textos.formulario.erro}</p>}
    {salvo && <p role="status" className="text-sm text-[#12855a]">{textos.v2.funcaoSalva}</p>}
    {sujo && podeEditar && <div className="flex justify-end">
      <Button disabled={editar.isPending} onClick={salvarFuncao}>
        <Check aria-hidden className="size-4" />{textos.v2.salvarFuncao}
      </Button>
    </div>}
    {onPermissoes ? <button type="button" onClick={onPermissoes} className={visual.permissoesPessoa}>
      <ShieldCheck aria-hidden className="size-5 text-[#1f5fd6]" />
      <span><strong>{permissao}</strong><small>{textos.abas.permissoes}</small></span>
      <ChevronRight aria-hidden className="size-5 text-[#8b91a0]" />
    </button> : <p className={visual.permissoesPessoa}>
      <ShieldCheck aria-hidden className="size-5 text-[#1f5fd6]" />{permissao}
    </p>}
  </div>;
}
