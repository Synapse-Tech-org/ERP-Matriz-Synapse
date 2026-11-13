"use client";

import { useRef, useState, type FormEvent, type UIEvent } from "react";
import Link from "next/link";
import { Bell, Camera, CircleHelp, KeyRound, Palette, Save, Trash2, UserRound } from "lucide-react";

import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { useEnterEnviaMensagem } from "@/lib/atendimento/preferencia-de-envio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDensidadeDasListas } from "@/lib/config/preferencia-densidade";
import { useTextos } from "@/lib/config/textos-provider";
import {
  usePreferenciaChatInternoDeNotificacao,
  usePreferenciaDuracaoDeNotificacao,
  usePreferenciaPosicaoDeNotificacao,
  usePreferenciaSomDeNotificacao,
  usePreferenciaVisualDeNotificacao,
} from "@/lib/atendimento/preferencias-notificacoes";
import { useAtualizarMeuUsuario, useAtualizarMinhaFoto, useMeuUsuario, useRemoverMinhaFoto } from "@/lib/equipe/use-equipe";

function dataDaSenha(valor: string | null, t: ReturnType<typeof useTextos>["configuracoes"]) {
  if (!valor) return t.senhaProvisoria;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(valor));
}

export function PaginaConfiguracoes() {
  const textos = useTextos();
  const t = textos.configuracoes;
  const notificacoes = textos.notificacoes;
  const preferenciaSom = usePreferenciaSomDeNotificacao();
  const preferenciaVisual = usePreferenciaVisualDeNotificacao();
  const preferenciaChatInterno = usePreferenciaChatInternoDeNotificacao();
  const preferenciaDuracao = usePreferenciaDuracaoDeNotificacao();
  const preferenciaPosicao = usePreferenciaPosicaoDeNotificacao();
  const [aba, setAba] = useState("perfil");
  const envio = useEnterEnviaMensagem();
  const densidade = useDensidadeDasListas();
  const abas = [
    { id: "perfil", nome: t.perfil, icone: UserRound },
    { id: "notificacoes", nome: t.abaNotificacoes, icone: Bell },
    { id: "interface", nome: t.abaInterface, icone: Palette },
    { id: "ajuda", nome: t.abaAjuda, icone: CircleHelp },
  ];
  const secoes = useRef<Record<string, HTMLElement | null>>({});

  function irParaSecao(id: string) {
    setAba(id);
    const secao = secoes.current[id];
    secao?.scrollIntoView?.({ block: "start" });
    secao?.focus({ preventScroll: true });
  }

  function acompanharRolagem(evento: UIEvent<HTMLDivElement>) {
    const topo = evento.currentTarget.getBoundingClientRect().top + 24;
    let secaoAtiva = abas[0].id;
    for (const { id } of abas) {
      const secao = secoes.current[id];
      if (secao && secao.getBoundingClientRect().top <= topo) secaoAtiva = id;
    }
    setAba(secaoAtiva);
  }
  const usuario = useMeuUsuario();
  const atualizar = useAtualizarMeuUsuario();
  const atualizarFoto = useAtualizarMinhaFoto();
  const removerFoto = useRemoverMinhaFoto();
  const [nomeEditado, setNomeEditado] = useState<string | null>(null);
  const [emailEditado, setEmailEditado] = useState<string | null>(null);
  const [telefoneEditado, setTelefoneEditado] = useState<string | null>(null);
  const [cargoEditado, setCargoEditado] = useState<string | null>(null);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [erroNome, setErroNome] = useState(false);
  const [salvo, setSalvo] = useState(false);

  if (usuario.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">{t.carregando}</p>;
  }
  if (usuario.isError || !usuario.data) {
    return <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => usuario.refetch()} className="m-6" />;
  }

  const dados = usuario.data;
  const nome = nomeEditado ?? dados.nome;
  const email = emailEditado ?? dados.email;
  const telefone = telefoneEditado ?? dados.telefone ?? "";
  const cargo = cargoEditado ?? dados.cargo ?? "";

  const emailAlterado = email.trim().toLowerCase() !== dados.email.toLowerCase();
  const alterado = nome.trim() !== dados.nome || emailAlterado
    || telefone.trim() !== (dados.telefone ?? "") || cargo.trim() !== (dados.cargo ?? "");

  function descartar() {
    setNomeEditado(null);
    setEmailEditado(null);
    setTelefoneEditado(null);
    setCargoEditado(null);
    setSenhaAtual("");
    setErroNome(false);
    setSalvo(false);
    atualizar.reset?.();
  }

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!alterado || atualizar.isPending || (emailAlterado && !senhaAtual)) return;
    setSalvo(false);
    const normalizado = nome.trim();
    if (!normalizado) {
      setErroNome(true);
      return;
    }
    setErroNome(false);
    atualizar.mutate(
      { nome: normalizado, email: email.trim(), telefone: telefone.trim() || null, cargo: cargo.trim() || null, senhaAtual: emailAlterado ? senhaAtual : null },
      { onSuccess: () => { descartar(); setSalvo(true); } },
    );
  }

  return (
    <div className={listaV2.pagina + " " + listaV2.modulo + " " + visual.paleta}>
      <CabecalhoListaV2 titulo={t.titulo} busca={textos.gestao?.v2?.buscaGlobal} />
      <header>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t.titulo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.descricaoGeral}</p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <nav aria-label={t.secoes} className="flex max-w-full shrink-0 gap-1 overflow-x-auto self-start rounded-2xl border bg-card p-2 lg:w-full lg:flex-col">
          {abas.map(({ id, nome, icone: Icone }) => (
            <button
              key={id}
              type="button"
              aria-current={aba === id ? "location" : undefined}
              aria-controls={"configuracoes-" + id}
              onClick={() => irParaSecao(id)}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=location]:bg-primary/10 aria-[current=location]:text-primary"
            >
              <Icone className="size-4" aria-hidden />{nome}
            </button>
          ))}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div onScroll={acompanharRolagem} className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain pr-1">
            <section id="configuracoes-perfil" ref={(secao) => { secoes.current.perfil = secao; }} tabIndex={-1} className="space-y-3 outline-none">
              <div>
                <h2 className="text-lg font-bold tracking-tight">{t.perfil}</h2>
                <p className="text-sm text-muted-foreground">{t.perfilDescricao}</p>
              </div>
              <form id="form-configuracoes-perfil" onSubmit={salvar}>
                <fieldset disabled={atualizar.isPending} className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3">
                        <UserRound aria-hidden className="size-9 rounded-full bg-muted p-2.5" />
                        {t.dadosPessoais}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-muted/30 p-4">
                        <AvatarIniciais id={dados.id} nome={nome || dados.nome} fotoUrl={dados.fotoUrl}
                          className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-primary-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold">{nome || dados.nome}</p>
                          {cargo && <p className="truncate text-sm text-muted-foreground">{cargo}</p>}
                        </div>
                        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
                          aria-busy={atualizarFoto.isPending}>
                          <Camera aria-hidden className="size-4" />{atualizarFoto.isPending ? t.salvando : t.alterarFoto}
                          <input type="file" className="sr-only" disabled={atualizarFoto.isPending || removerFoto.isPending}
                            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(evento) => {
                              const arquivo = evento.target.files?.[0];
                              if (arquivo) atualizarFoto.mutate(arquivo);
                              evento.currentTarget.value = "";
                            }} />
                        </label>
                        {dados.fotoUrl && (
                          <Button type="button" variant="outline" size="sm" disabled={removerFoto.isPending || atualizarFoto.isPending}
                            onClick={() => removerFoto.mutate()}>
                            <Trash2 aria-hidden className="size-4" />{t.removerFoto}
                          </Button>
                        )}
                      </div>
                      {(atualizarFoto.isError || removerFoto.isError) && <p role="alert" className="text-sm text-destructive">{t.fotoErro}</p>}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="perfil-nome">{t.nome}</Label>
                          <Input id="perfil-nome" autoComplete="name" value={nome} aria-invalid={erroNome}
                            onChange={(evento) => { setNomeEditado(evento.target.value); setErroNome(false); setSalvo(false); }} />
                          {erroNome && <p role="alert" className="text-xs text-destructive">{t.erroNome}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="perfil-telefone">{t.telefone}</Label>
                          <Input id="perfil-telefone" type="tel" autoComplete="tel" value={telefone} placeholder={t.naoInformado}
                            onChange={(evento) => { setTelefoneEditado(evento.target.value); setSalvo(false); }} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="perfil-cargo">{t.cargo}</Label>
                          <Input id="perfil-cargo" autoComplete="organization-title" value={cargo} placeholder={t.naoInformado}
                            onChange={(evento) => { setCargoEditado(evento.target.value); setSalvo(false); }} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3">
                        <KeyRound aria-hidden className="size-9 rounded-full bg-muted p-2.5" />
                        {t.acessoConta}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="perfil-email">{t.email}</Label>
                        <Input id="perfil-email" type="email" required autoComplete="email" value={email}
                          onChange={(evento) => {
                            setEmailEditado(evento.target.value);
                            if (evento.target.value.trim().toLowerCase() === dados.email.toLowerCase()) setSenhaAtual("");
                            setSalvo(false);
                          }} />
                      </div>
                      {emailAlterado && (
                        <div className="space-y-2 rounded-xl bg-accent p-3 text-accent-foreground">
                          <p className="text-sm">{t.emailAjuda}</p>
                          <Label htmlFor="perfil-senha-atual">{t.senhaAtual}</Label>
                          <PasswordInput id="perfil-senha-atual" required autoComplete="current-password" value={senhaAtual}
                            onChange={(evento) => setSenhaAtual(evento.target.value)} />
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                        <span className="text-sm font-medium">{t.papel}</span>
                        <Badge variant="secondary">{dados.papel}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                        <div className="text-xs text-muted-foreground">
                          <p className="text-sm font-medium text-foreground">{t.senha}</p>
                          <p>{t.ultimaAlteracaoSenha} · {dataDaSenha(dados.senhaAlteradaEm, t)}</p>
                        </div>
                        <Link href="/trocar-senha" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
                          {t.alterarSenha}
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </fieldset>
              </form>
            </section>
            <section id="configuracoes-notificacoes" ref={(secao) => { secoes.current.notificacoes = secao; }} tabIndex={-1} className="space-y-3 outline-none">
              <h2 className="text-lg font-bold tracking-tight">{t.abaNotificacoes}</h2>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>{notificacoes.somTitulo}</CardTitle>
                  <CardDescription>{notificacoes.somDescricao}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{preferenciaSom.somHabilitado ? notificacoes.somAtivado : notificacoes.somDesativado}</p>
                        <p className="text-xs text-muted-foreground">{notificacoes.somDescricao}</p>
                      </div>
                      <Switch checked={preferenciaSom.somHabilitado} onCheckedChange={preferenciaSom.definirSomHabilitado} aria-label={notificacoes.somTitulo} />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{preferenciaVisual.visualHabilitado ? notificacoes.visualAtivado : notificacoes.visualDesativado}</p>
                        <p className="text-xs text-muted-foreground">{notificacoes.visualDescricao}</p>
                      </div>
                      <Switch checked={preferenciaVisual.visualHabilitado} onCheckedChange={preferenciaVisual.definirVisualHabilitado} aria-label={notificacoes.visualTitulo} />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{preferenciaChatInterno.chatInternoHabilitado ? notificacoes.chatInternoAtivado : notificacoes.chatInternoDesativado}</p>
                        <p className="text-xs text-muted-foreground">{notificacoes.chatInternoDescricao}</p>
                      </div>
                      <Switch checked={preferenciaChatInterno.chatInternoHabilitado} onCheckedChange={preferenciaChatInterno.definirChatInternoHabilitado} aria-label={notificacoes.chatInternoTitulo} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{notificacoes.duracaoTitulo}</p>
                        <p className="text-xs text-muted-foreground">{notificacoes.duracaoDescricao}</p>
                      </div>
                      <Select value={String(preferenciaDuracao.duracaoSegundos)} onValueChange={(valor) => { if (valor) preferenciaDuracao.definirDuracaoSegundos(Number(valor)); }}>
                        <SelectTrigger aria-label={notificacoes.duracaoTitulo}>
                          <SelectValue>{notificacoes.duracaoOpcao.replace("{segundos}", String(preferenciaDuracao.duracaoSegundos))}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 3, 5, 8, 15, 30].map((segundos) => <SelectItem key={segundos} value={String(segundos)}>{notificacoes.duracaoOpcao.replace("{segundos}", String(segundos))}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{notificacoes.posicaoTitulo}</p>
                        <p className="text-xs text-muted-foreground">{notificacoes.posicaoDescricao}</p>
                      </div>
                      <Select value={preferenciaPosicao.posicao} onValueChange={(valor) => { if (valor === "TOPO" || valor === "BAIXO") preferenciaPosicao.definirPosicao(valor); }}>
                        <SelectTrigger aria-label={notificacoes.posicaoTitulo}>
                          <SelectValue>{preferenciaPosicao.posicao === "TOPO" ? notificacoes.posicaoTopo : notificacoes.posicaoBaixo}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TOPO">{notificacoes.posicaoTopo}</SelectItem>
                          <SelectItem value="BAIXO">{notificacoes.posicaoBaixo}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
            <section id="configuracoes-interface" ref={(secao) => { secoes.current.interface = secao; }} tabIndex={-1} className="space-y-3 outline-none">
              <h2 className="text-lg font-bold tracking-tight">{t.abaInterface}</h2>
              <Card className="rounded-2xl">
                <CardHeader><CardTitle>{t.densidadeListas}</CardTitle></CardHeader>
                <CardContent>
                  <div role="group" aria-label={t.densidadeListas} className={listaV2.opcoes}>
                    <button type="button" aria-pressed={!densidade.compacta} onClick={() => densidade.definir(false)}>{t.densidadeConfortavel}</button>
                    <button type="button" aria-pressed={densidade.compacta} onClick={() => densidade.definir(true)}>{t.densidadeCompacta}</button>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>{t.enterEnvia}</CardTitle>
                  <CardDescription>{t.enterEnviaDescricao}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Switch checked={envio.ativo} onCheckedChange={envio.definir} aria-label={t.enterEnvia} />
                </CardContent>
              </Card>
            </section>
            <section id="configuracoes-ajuda" ref={(secao) => { secoes.current.ajuda = secao; }} tabIndex={-1} className="min-h-full space-y-3 outline-none">
              <h2 className="text-lg font-bold tracking-tight">{t.abaAjuda}</h2>
              <Card className="rounded-2xl">
                <CardHeader><CardTitle>{t.feedbackTitulo}</CardTitle></CardHeader>
                <CardContent><Link href="/feedbacks" className="text-primary underline">{t.feedbackAcao}</Link></CardContent>
              </Card>
            </section>
          </div>
          {(alterado || salvo || atualizar.isError) && (
            <div className="z-10 mx-auto mt-3 shrink-0 flex w-fit max-w-full flex-wrap items-center justify-center gap-3 rounded-2xl border bg-card p-2.5 shadow-lg">
              {salvo && <span role="status" className="px-2 text-sm text-cor-sucesso">{t.salvo}</span>}
              {atualizar.isError && !salvo && <span role="alert" className="px-2 text-sm text-destructive">{t.erro}</span>}
              {alterado && (
                <>
                  <span className="px-2 text-sm font-medium">{t.alteracoesPendentes}</span>
                  <Button type="button" variant="ghost" disabled={atualizar.isPending} onClick={descartar}>{t.descartar}</Button>
                  <Button type="submit" form="form-configuracoes-perfil" disabled={atualizar.isPending}>
                    <Save aria-hidden className="size-4" />{atualizar.isPending ? t.salvando : t.salvarPerfil}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
