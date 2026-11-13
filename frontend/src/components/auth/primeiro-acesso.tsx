"use client";

import { useState } from "react";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTextos } from "@/lib/config/textos-provider";
import { useAtualizarMeuUsuario, useAtualizarMinhaFoto, useMeuUsuario } from "@/lib/equipe/use-equipe";

export function PrimeiroAcesso({ onConcluir }: { onConcluir: () => void }) {
  const { trocarSenha: { primeiroAcesso: textos }, configuracoes: perfil } = useTextos();
  const [orientacao, setOrientacao] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const usuario = useMeuUsuario(!orientacao);
  const atualizar = useAtualizarMeuUsuario();
  const foto = useAtualizarMinhaFoto();
  const dados = usuario.data;
  if (!textos) return null;

  return (
    <Card className="rounded-3xl shadow-sm sm:p-2">
      <CardHeader>
        <CardDescription>{textos.titulo} · {orientacao ? textos.etapaOrientacao : textos.etapaPerfil}</CardDescription>
        <CardTitle className="text-2xl">{orientacao ? textos.orientacao : textos.perfil}</CardTitle>
      </CardHeader>
      <CardContent>
        {orientacao ? (
          <div className="space-y-5">
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {textos.dicas.map((dica) => <li key={dica}>{dica}</li>)}
            </ul>
            <Button type="button" onClick={onConcluir}>{textos.concluir}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {usuario.isPending && <p role="status">{perfil.carregando}</p>}
            {usuario.isError && <ErroDeCarregamento mensagem={perfil.erro} onTentarNovamente={() => void usuario.refetch()} />}
            {dados && (
              <form id="primeiro-acesso-perfil" className="space-y-4" onSubmit={(evento) => {
                evento.preventDefault();
                const novoNome = (nome ?? dados.nome).trim();
                if (!novoNome || atualizar.isPending || foto.isPending) return;
                if (novoNome === dados.nome) {
                  setOrientacao(true);
                  return;
                }
                atualizar.mutate({
                  nome: novoNome, email: dados.email, telefone: dados.telefone,
                  cargo: dados.cargo, senhaAtual: null,
                }, { onSuccess: () => setOrientacao(true) });
              }}>
                <div className="flex items-center gap-3">
                  <AvatarIniciais id={dados.id} nome={dados.nome} fotoUrl={dados.fotoUrl}
                    className="grid size-12 place-items-center rounded-full font-bold text-primary-foreground" />
                  <label className="cursor-pointer rounded-lg border px-3 py-2 text-sm">
                    {foto.isPending ? perfil.salvando : perfil.alterarFoto}
                    <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp"
                      disabled={foto.isPending || atualizar.isPending} onChange={(evento) => {
                        const arquivo = evento.target.files?.[0];
                        if (arquivo) foto.mutate(arquivo);
                        evento.currentTarget.value = "";
                      }} />
                  </label>
                </div>
                {foto.isError && <p role="alert" className="text-destructive">{perfil.fotoErro}</p>}
                <div className="space-y-2">
                  <Label htmlFor="primeiro-acesso-nome">{perfil.nome}</Label>
                  <Input id="primeiro-acesso-nome" required value={nome ?? dados.nome} autoComplete="name"
                    onChange={(evento) => setNome(evento.target.value)} />
                </div>
                {atualizar.isError && <p role="alert" className="text-destructive">{perfil.erro}</p>}
              </form>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={foto.isPending || atualizar.isPending}
                onClick={() => setOrientacao(true)}>{textos.pular}</Button>
              <Button type="submit" form="primeiro-acesso-perfil"
                disabled={!dados || !(nome ?? dados.nome).trim() || foto.isPending || atualizar.isPending}>{textos.continuar}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
