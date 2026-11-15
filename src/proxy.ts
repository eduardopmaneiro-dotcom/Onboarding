import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/** Rotas acessíveis sem sessão. */
const PUBLIC = ["/login", "/recuperar-senha", "/redefinir-senha", "/primeiro-acesso", "/api/v1/health"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isLoggedIn && pathname === "/login") return NextResponse.redirect(new URL("/dashboard", req.url));
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
