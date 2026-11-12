import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { cadastrarConta } from "@/lib/auth/sessoes-servidor";
import { obterUrlApiServidor } from "@/lib/api/server-api-url";

/**
 * Faz o papel de BFF para o login: chama o backend real (`POST /api/v1/auth/login`, E07), que
 * devolve `{accessToken, refreshToken, expiraEmSegundos}` no corpo — não como cookie. Aqui o
 * refreshToken vira cookie httpOnly e nunca chega ao browser; só accessToken/expiraEmSegundos
 * voltam na resposta, para o Zustand guardar em memória.
 */
export async function POST(requisicao: NextRequest) {
  if (["cross-site", "same-site"].includes(requisicao.headers.get("sec-fetch-site") ?? "")) {
    return new NextResponse(null, { status: 403 });
  }
  const corpo = (await requisicao.json()) as Record<string, unknown>;
  const { manterSessaoAtiva, ...credenciais } = corpo;
  const sessaoPersistente = manterSessaoAtiva === true;

  const respostaBackend = await fetch(`${obterUrlApiServidor()}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credenciais),
  });

  if (!respostaBackend.ok) {
    const problema = await respostaBackend.json().catch(() => null);
    return NextResponse.json(problema ?? { detail: "Falha de autenticação" }, {
      status: respostaBackend.status,
    });
  }

  const sessao = (await respostaBackend.json()) as {
    accessToken: string;
    refreshToken: string;
    expiraEmSegundos: number;
  };

  const cookieStore = await cookies();
  await cadastrarConta(cookieStore, sessao, sessaoPersistente,
    typeof credenciais.email === "string" ? credenciais.email : undefined);

  return NextResponse.json({
    accessToken: sessao.accessToken,
    expiraEmSegundos: sessao.expiraEmSegundos,
  });
}
