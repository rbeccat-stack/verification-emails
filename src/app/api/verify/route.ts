import { NextResponse } from "next/server";

// Proxy serveur vers le webhook n8n : l'URL et la clé restent côté serveur
// (variables sans préfixe NEXT_PUBLIC_), le navigateur ne voit que /api/verify.
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const WEBHOOK_KEY = process.env.N8N_WEBHOOK_KEY;

// Vercel refuse les corps de requête au-delà de 4,5 Mo.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!WEBHOOK_URL) {
    return NextResponse.json(
      { success: false, message: "N8N_WEBHOOK_URL non configurée côté serveur." },
      { status: 500 },
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return NextResponse.json(
      { success: false, message: "Envoi du fichier invalide." },
      { status: 400 },
    );
  }

  // On ne relaie que des fichiers valides, pour ne pas lancer le workflow pour rien.
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { success: false, message: "Aucun fichier reçu." },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json(
      { success: false, message: "Le fichier envoyé doit être au format .xlsx." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, message: "Le fichier dépasse la taille maximale de 4 Mo." },
      { status: 413 },
    );
  }

  const upstreamBody = new FormData();
  upstreamBody.append("file", file, file.name);

  let upstream: Response;
  try {
    upstream = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: WEBHOOK_KEY ? { "X-Webhook-Key": WEBHOOK_KEY } : undefined,
      body: upstreamBody,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Le service de vérification est injoignable." },
      { status: 502 },
    );
  }

  // n8n répond 200 + { success, message… }, y compris pour ses erreurs métier.
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    payload = null;
  }
  if (!upstream.ok || !payload || typeof payload !== "object") {
    return NextResponse.json(
      { success: false, message: "Réponse inattendue du service de vérification." },
      { status: 502 },
    );
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
