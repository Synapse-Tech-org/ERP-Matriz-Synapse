import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { cadastrarConta, gravarSessao, identidadeDaSessao, removerSessaoAtiva, renovarNoBackend, sessaoAtiva } from "@/lib/auth/sessoes-servidor";
import { TEXTOS_DE_ERRO } from "@/lib/config/schema-erros";

/**
 * O backend rotaciona o refresh token a cada uso (RenovarSessaoUseCase): o token apresentado
 * morre, um novo nasce. Por isso este handler SEMPRE reescreve o cookie com o token novo — nunca
 * reaproveita o antigo. Uma chamada a este endpoint sem atualizar o cookie deixaria a sessão
 * inutilizável na próxima renovação (o token antigo já foi revogado no backend).
 */
export async function POST(requisicao?: NextRequest) {
  const cookieStore = await cookies();
  const { conta, refreshToken, persistente } = sessaoAtiva(cookieStore);

  const esperado = requisicao?.headers.get("X-Synapse-Conta");
  if (conta && esperado && esperado !== conta.id) {
    return new NextResponse(null, { status: 409 });
  }

  if (!refreshToken) {
    return NextResponse.json({ detail: "Sem sessão para renovar" }, { status: 401 });
  }

  const respostaBackend = await renovarNoBackend(refreshToken);
  if (!respostaBackend) {
    // Falha de transporte não revoga credenciais. Não registra token nem a URL interna.
    return NextResponse.json({ type: "about:blank", title: TEXTOS_DE_ERRO.indisponivel, status: 503 }, {
      status: 503, headers: { "Content-Type": "application/problem+json" },
    });
  }

  if (!respostaBackend.ok) {
    if ([401, 403].includes(respostaBackend.status)) {
      removerSessaoAtiva(cookieStore);
    }
    const problema = await respostaBackend.json().catch(() => null);
    return NextResponse.json(problema ?? { detail: "Sessão expirada" }, {
      status: respostaBackend.status,
    });
  }

  const sessao = (await respostaBackend.json()) as {
    accessToken: string;
    refreshToken: string;
    expiraEmSegundos: number;
  };

  if (conta && identidadeDaSessao(sessao.accessToken)?.id !== conta.id) {
    removerSessaoAtiva(cookieStore);
    return new NextResponse(null, { status: 401 });
  }
  if (conta) gravarSessao(cookieStore, sessao, persistente, conta, false);
  else await cadastrarConta(cookieStore, sessao, persistente);

  return NextResponse.json({
    accessToken: sessao.accessToken,
    expiraEmSegundos: sessao.expiraEmSegundos,
  });
}
