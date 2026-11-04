import { NextResponse, type NextRequest } from "next/server";

// Accès protégé par mot de passe (Basic Auth) : sans lui, n'importe qui pourrait
// créer des fichiers dans le Drive connecté à n8n. Sans APP_PASSWORD, tout est refusé.
const APP_PASSWORD = process.env.APP_PASSWORD;

export function proxy(req: NextRequest) {
  if (!APP_PASSWORD) {
    return new NextResponse("APP_PASSWORD non configuré côté serveur.", { status: 500 });
  }

  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    // Le nom d'utilisateur est libre, seul le mot de passe compte.
    if (decoded.slice(decoded.indexOf(":") + 1) === APP_PASSWORD) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentification requise.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Verification Emails", charset="UTF-8"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
