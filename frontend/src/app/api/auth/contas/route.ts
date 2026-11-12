import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { gravarSessao, identidadeDaSessao, lerConta, listarContas, removerConta, renovarNoBackend,
  sessaoAtiva, tokenDaConta, type SessaoBackend } from "@/lib/auth/sessoes-servidor";

export async function GET() {
  const store = await cookies();
  const atual = sessaoAtiva(store);
  if (!atual.refreshToken) return new NextResponse(null, { status: 401 });
  return NextResponse.json(listarContas(store)
    .filter(({ id }) => id !== atual.conta?.id)
    .map(({ id, nome, papel }) => ({ id, nome, papel })), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(requisicao: NextRequest) {
  if (["cross-site", "same-site"].includes(requisicao.headers.get("sec-fetch-site") ?? "")
    || !requisicao.headers.get("content-type")?.startsWith("application/json")) {
    return new NextResponse(null, { status: 403 });
  }
  const corpo = await requisicao.json().catch(() => null);
  const store = await cookies();
  const atual = sessaoAtiva(store);
  if (!atual.refreshToken) return new NextResponse(null, { status: 401 });

  const conta = lerConta(store, corpo?.id);
  if (!conta || conta.id === atual.conta?.id) return new NextResponse(null, { status: 404 });

  const resposta = await renovarNoBackend(tokenDaConta(store, conta.id)!);
  if (resposta?.status === 401 || resposta?.status === 403) {
    removerConta(store, conta.id);
    return new NextResponse(null, { status: 401 });
  }
  if (!resposta?.ok) return new NextResponse(null, { status: 503 });

  const sessao = await resposta.json() as SessaoBackend;
  const identidade = identidadeDaSessao(sessao.accessToken);
  if (identidade?.id !== conta.id) {
    removerConta(store, conta.id);
    return new NextResponse(null, { status: 401 });
  }

  gravarSessao(store, sessao, conta.persistente, { ...conta, papel: identidade.papel }, true);
  return new NextResponse(null, { status: 204 });
}
