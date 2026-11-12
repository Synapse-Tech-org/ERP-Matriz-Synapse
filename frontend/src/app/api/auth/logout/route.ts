import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { removerSessaoAtiva, sessaoAtiva } from "@/lib/auth/sessoes-servidor";
import { obterUrlApiServidor } from "@/lib/api/server-api-url";

export async function POST() {
  const cookieStore = await cookies();
  const { refreshToken } = sessaoAtiva(cookieStore);

  if (refreshToken) {
    // Best-effort: mesmo se o backend falhar em revogar, o cookie local é removido de qualquer
    // forma — o usuário não pode ficar preso numa sessão que ele mandou encerrar.
    await fetch(`${obterUrlApiServidor()}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => null);
  }

  removerSessaoAtiva(cookieStore);
  return new NextResponse(null, { status: 204 });
}
