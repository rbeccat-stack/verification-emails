"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Check,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  MailCheck,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Config & types                                                            */
/* -------------------------------------------------------------------------- */

// Proxy serveur (src/app/api/verify) : l'URL du webhook n8n n'est jamais exposée au navigateur.
const VERIFY_ENDPOINT = "/api/verify";

// Vercel refuse les corps de requête au-delà de 4,5 Mo.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

type VerifyResult = {
  fileName: string;
  totalRows: number;
  /** Nombre de lignes par statut (absent si le workflow n8n ne le renvoie pas). */
  stats?: Record<string, number>;
  resultUrl: string;
  downloadUrl: string;
};

type VerifyResponse = {
  success?: boolean;
  message?: string;
  totalRows?: number;
  stats?: Record<string, number>;
  resultUrl?: string;
  downloadUrl?: string;
};

const STATUSES = [
  { code: "OK_Match_URL", score: 100, label: "L'email correspond au site internet", dot: "bg-success" },
  { code: "OK_Match_Nom", score: 80, label: "L'email correspond au nom légal", dot: "bg-success" },
  { code: "OK_Match_Acronyme", score: 70, label: "L'email correspond à l'acronyme", dot: "bg-success" },
  { code: "EMAIL_DOMAINE_GRAND_PUBLIC", score: 30, label: "Adresse gmail, orange, outlook…", dot: "bg-yellow" },
  { code: "ANOMALIE_A_VERIFIER", score: 20, label: "Aucune correspondance trouvée", dot: "bg-orange" },
  { code: "ERREUR_PAS_D_EMAIL", score: 0, label: "Email absent ou inexploitable", dot: "bg-danger" },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function validateFile(candidate: File): string | null {
  if (!candidate.name.toLowerCase().endsWith(".xlsx")) {
    return "Le fichier doit être au format .xlsx.";
  }
  if (candidate.size === 0) return "Ce fichier est vide.";
  if (candidate.size > MAX_FILE_SIZE) {
    return "Le fichier dépasse la taille maximale de 4 Mo.";
  }
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function formatCount(value: number) {
  return value.toLocaleString("fr-FR");
}

function formatPercent(part: number, total: number) {
  const percent = (part / total) * 100;
  // Une part infime ne doit pas s'afficher « 0 % » alors qu'elle existe.
  if (percent > 0 && percent < 1) return "< 1 %";
  return `${Math.round(percent)} %`;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Verrou synchrone contre le multi-clic (le state React est asynchrone).
  const inFlightRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  /* ------------------------- Parallax léger du hero ------------------------ */
  // Piloté hors React (style direct) pour rester à 60 fps ; désactivé si
  // l'utilisateur préfère moins de mouvement.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const progress = Math.min(window.scrollY / 400, 1);
      hero.style.opacity = String(1 - progress * 0.6);
      hero.style.transform = `translateY(${progress * 40}px) scale(${1 - progress * 0.03})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Le résultat remplace le formulaire : on le ramène en haut de l'écran.
  useEffect(() => {
    if (!result) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [result]);

  /* ----------------------------- File handling ----------------------------- */

  function selectFile(candidate: File | undefined) {
    if (!candidate) return;
    const problem = validateFile(candidate);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setResult(null);
    setFile(candidate);
  }

  function clearFile() {
    setFile(null);
    // Permet de resélectionner le même fichier ensuite.
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (!isLoading) selectFile(e.dataTransfer.files[0]);
  }

  /* ------------------------------ Submission ------------------------------- */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || isLoading || inFlightRef.current) return;

    inFlightRef.current = true;
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(VERIFY_ENDPOINT, { method: "POST", body });

      const data = (await response.json().catch(() => null)) as VerifyResponse | null;
      if (!data) throw new Error("Réponse inattendue du serveur.");
      if (!data.success || !data.resultUrl || !data.downloadUrl) {
        throw new Error(data.message || "Le traitement a échoué.");
      }

      setResult({
        fileName: file.name,
        totalRows: data.totalRows ?? 0,
        stats: data.stats,
        resultUrl: data.resultUrl,
        downloadUrl: data.downloadUrl,
      });
      clearFile();
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Impossible de joindre le serveur. Vérifiez votre connexion."
          : err instanceof Error
            ? err.message
            : "Une erreur inconnue est survenue.";
      setError(message);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }

  /* -------------------------------- Render --------------------------------- */

  return (
    <main className="relative isolate flex-1 overflow-x-clip">
      <AmbientBackground />

      {/* ---------------------------- Error banner --------------------------- */}
      {error && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))]"
        >
          <div className="flex w-full max-w-2xl animate-fade-up items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-fg-body shadow-card">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">La vérification a échoué</p>
              <p className="mt-0.5 break-words text-fg-muted">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Fermer l'alerte"
              className="rounded-md p-1 text-fg-muted transition duration-200 hover:bg-blue-50 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-5xl px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-14 sm:px-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pt-20 lg:px-8 lg:pt-28">
        {/* ------------------------------ Header ------------------------------ */}
        <header
          ref={heroRef}
          className="mx-auto max-w-2xl text-center will-change-transform"
        >
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1 text-xs font-medium text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" />
            n8n × Google Sheets
          </span>
          <h1 className="mt-5 animate-fade-up text-balance text-[clamp(2.25rem,3vw+1.25rem,4rem)] font-semibold leading-[1.15] text-navy [animation-delay:80ms]">
            Vérification <span className="text-orange">Emails</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl animate-fade-up text-pretty text-[clamp(0.95rem,0.5vw+0.8rem,1.125rem)] leading-relaxed text-fg-muted [animation-delay:160ms]">
            Déposez votre fichier de contacts pour vérifier que chaque email
            correspond bien au site et au nom de l&apos;entreprise.
          </p>
        </header>

        {/* ------------------------------ Results ----------------------------- */}
        <section ref={resultsRef} className="scroll-mt-6" aria-live="polite">
          {result && <ResultCard result={result} onReset={() => setResult(null)} />}
        </section>

        {/* ------------------------------ Form card --------------------------- */}
        {!result && (
        <form
          onSubmit={handleSubmit}
          className="relative mx-auto mt-10 max-w-2xl animate-scale-in rounded-xl border border-border bg-surface p-5 shadow-card [animation-delay:240ms] sm:mt-12 sm:p-8"
        >
          <p className="text-sm font-medium text-fg">Fichier de contacts</p>

          {file ? (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-success/50 bg-bg-input px-4 py-3.5">
              <FileSpreadsheet className="h-6 w-6 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{file.name}</p>
                <p className="text-xs tabular-nums text-fg-muted">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={clearFile}
                disabled={isLoading}
                aria-label="Retirer le fichier"
                className="shrink-0 rounded-md p-1.5 text-fg-muted transition duration-200 hover:bg-blue-50 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="file"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`mt-2 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-4 py-9 text-center transition duration-200 ease-expo focus-within:border-blue focus-within:shadow-[0_0_0_3px_var(--color-blue-100)] ${
                isDragging
                  ? "border-blue bg-blue-50"
                  : "border-blue-200 hover:border-blue hover:bg-blue-50/60"
              }`}
            >
              <Upload className="h-6 w-6 text-blue" />
              <span className="mt-3 text-sm font-medium text-fg">
                Glissez votre fichier ici ou{" "}
                <span className="text-blue-700 underline underline-offset-4">parcourez</span>
              </span>
              <span className="mt-1 text-xs text-fg-muted">Format .xlsx, 4 Mo maximum</span>
              <input
                ref={inputRef}
                id="file"
                name="file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => selectFile(e.target.files?.[0])}
                className="sr-only"
              />
            </label>
          )}

          <div className="mt-5 rounded-lg bg-blue-50 px-4 py-3.5 text-xs leading-relaxed text-fg-muted">
            <p className="font-medium text-fg">Ce que le fichier doit contenir</p>
            <p className="mt-1">
              Un onglet <span className="font-medium text-fg">CONTACTS</span> avec une colonne
              pour l&apos;email, une pour le site internet et une pour le nom légal.
              Les autres colonnes sont conservées.
            </p>
          </div>

          <button
            type="submit"
            disabled={!file || isLoading}
            className="btn-invox mt-8 inline-flex w-[calc(100%-5px)] items-center justify-center gap-2 px-5 py-3.5 text-[0.95rem] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Vérification...
              </>
            ) : (
              <>
                <MailCheck className="h-4 w-4" />
                Vérifier les emails
              </>
            )}
          </button>
          <p
            className={`mt-4 text-center text-xs transition-colors duration-300 ${
              isLoading ? "animate-pulse-soft text-blue-700" : "text-fg-muted"
            }`}
          >
            Le résultat est créé dans une nouvelle Google Sheet, en quelques secondes.
          </p>
        </form>
        )}

        {/* ------------------------------- Légende ---------------------------- */}
        {!result?.stats && (
        <section className="mx-auto mt-12 max-w-2xl sm:mt-16">
          <p className="text-sm font-medium text-orange-600">Lecture du résultat</p>
          <h2 className="mt-1 text-2xl font-semibold text-navy sm:text-[1.75rem]">
            Les statuts ajoutés au fichier
          </h2>
          <ul className="mt-5 divide-y divide-blue-100 rounded-xl border border-border bg-surface shadow-card">
            {STATUSES.map((status) => (
              <li key={status.code} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs font-medium text-fg sm:text-sm">{status.code}</p>
                  <p className="text-xs text-fg-muted">{status.label}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-navy">
                  {status.score}
                </span>
              </li>
            ))}
          </ul>
        </section>
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sous-composants (même fichier, volontairement)                            */
/* -------------------------------------------------------------------------- */

/** Fond : bandeau bleu clair en haut (coin arrondi façon invox.fr) + quelques
 *  formes de marque flottantes, discrètes. */
function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(620px,90vh)] overflow-hidden"
    >
      <div className="absolute inset-0 rounded-br-[clamp(48px,10vw,120px)] bg-blue-50" />
      {/* Formes réservées aux grands écrans : elles flanquent le titre sans le chevaucher. */}
      <div className="absolute left-[7%] top-[20%] hidden h-16 w-16 animate-float rounded-full border-2 border-dashed border-blue-200 lg:block" />
      <div className="absolute right-[9%] top-[12%] h-3.5 w-3.5 animate-float rounded-full bg-orange [animation-delay:-3s]" />
      <div className="absolute right-[13%] top-[44%] hidden h-5 w-5 animate-float rounded-[5px] bg-yellow [animation-delay:-6s] lg:block" />
    </div>
  );
}

/** Part des emails confirmés, répartition en barre, puis détail chiffré par statut. */
function ResultStats({ stats }: { stats: Record<string, number> }) {
  const rows = STATUSES.map((status) => ({ ...status, count: stats[status.code] ?? 0 })).filter(
    (status) => status.count > 0,
  );
  const total = rows.reduce((sum, status) => sum + status.count, 0);
  if (total === 0) return null;

  const confirmed = rows
    .filter((status) => status.code.startsWith("OK_"))
    .reduce((sum, status) => sum + status.count, 0);

  return (
    <div className="mt-6 border-t border-blue-100 pt-6">
      <p className="font-display text-[clamp(2.5rem,4vw+1.5rem,3.5rem)] font-semibold leading-none tabular-nums text-navy">
        {formatPercent(confirmed, total)}
      </p>
      <p className="mt-2 text-sm text-fg-muted">
        d&apos;emails confirmés :{" "}
        <span className="tabular-nums">
          {formatCount(confirmed)} sur {formatCount(total)}
        </span>
      </p>

      {/* Détail chiffré juste en dessous : la couleur n'est jamais seule à porter l'information. */}
      <div aria-hidden="true" className="mt-5 flex h-2.5 gap-0.5">
        {rows.map((status) => (
          <div
            key={status.code}
            title={`${status.label} : ${formatCount(status.count)} (${formatPercent(status.count, total)})`}
            style={{ flexGrow: status.count }}
            className={`min-w-1 basis-0 first:rounded-l last:rounded-r ${status.dot}`}
          />
        ))}
      </div>

      <ul className="mt-5 divide-y divide-blue-100">
        {rows.map((status) => (
          <li key={status.code} className="flex items-center gap-3 py-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
            <span className="min-w-0 flex-1 text-sm text-fg">{status.label}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-navy">
              {formatCount(status.count)}
            </span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-fg-muted">
              {formatPercent(status.count, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultCard({
  result,
  onReset,
}: {
  result: VerifyResult;
  onReset: () => void;
}) {
  return (
    <div className="mx-auto mt-10 max-w-2xl animate-scale-in rounded-xl border border-border bg-surface p-5 shadow-card sm:mt-12 sm:p-8">
      <div className="flex items-start gap-3">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-navy">Vérification terminée</h2>
          <p className="mt-0.5 break-words text-sm text-fg-muted">
            <span className="font-medium tabular-nums text-fg">
              {formatCount(result.totalRows)} ligne{result.totalRows > 1 ? "s" : ""}
            </span>{" "}
            vérifiée{result.totalRows > 1 ? "s" : ""} dans {result.fileName}.
          </p>
        </div>
      </div>
      {result.stats && <ResultStats stats={result.stats} />}
      <div className="mt-6 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <a
          href={result.resultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-invox inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
        >
          <ExternalLink className="h-4 w-4" />
          Ouvrir la Google Sheet
        </a>
        <a
          href={result.downloadUrl}
          className="btn-invox inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
        >
          <Download className="h-4 w-4" />
          Télécharger en .xlsx
        </a>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-blue-700 underline-offset-4 transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Vérifier un autre fichier
      </button>
    </div>
  );
}
