import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { runtimeMode } from "@/lib/runtime-mode";
import { canUseStaging } from "@/lib/staging-access";

export async function proxy(request: NextRequest) {
  const mode = runtimeMode();
  if (mode === "demo") return NextResponse.next();
  if (mode === "unconfigured") return NextResponse.json({ error: "Serviço indisponível: configuração pendente." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  // The callback establishes the session; it must be reachable before authentication.
  if (request.nextUrl.pathname === "/auth/confirm") return NextResponse.next();
  // This page contains no session, tenant data or server queries.
  if (request.nextUrl.pathname === "/offline") return NextResponse.next();

  let response = NextResponse.next({ request });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data } = await client.auth.getUser();
  if (data.user && request.nextUrl.pathname !== "/login" && !await canUseStaging(client, data.user.id)) {
    return NextResponse.json({ error: "Esta homologação aceita somente os usuários da organização sintética de testes." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const publicPath = ["/login", "/api/v1/health", "/offline.html"].includes(request.nextUrl.pathname);
  const withCookies = (next: NextResponse) => {
    response.cookies.getAll().forEach(cookie => next.cookies.set(cookie));
    next.headers.set("Cache-Control", "no-store");
    return next;
  };
  if (!data.user && !publicPath) {
    if (request.nextUrl.pathname.startsWith("/api/")) return withCookies(NextResponse.json({ error: "Autenticação necessária." }, { status: 401 }));
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);
    return withCookies(NextResponse.redirect(url));
  }
  const isPasswordSetup = request.nextUrl.searchParams.get("passwordSetup") === "recovery";
  if (data.user && request.nextUrl.pathname === "/login" && !isPasswordSetup) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withCookies(NextResponse.redirect(url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js).*)"]
};
