'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import SpeedTest from '@cloudflare/speedtest';
import Modal from '@/components/Modal';
import CookieBanner from '@/components/CookieBanner';

type Status = 'running' | 'done';

interface LookupData {
  ip:      string | null;
  isp:     string | null;
  city:    string | null;
  country: string | null;
}

function formatMbps(bps: number): string {
  const mbps = bps / 1e6;
  return mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2);
}

export default function Home() {
  const [runKey, setRunKey] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState<string>('0');
  const [finalDownloadMbps, setFinalDownloadMbps] = useState<number | null>(null); // used by later phases
  const [status, setStatus] = useState<Status>('running');
  const [lookup, setLookup] = useState<LookupData | null>(null); // null = still loading
  const [verdict, setVerdict] = useState<string | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictVisible, setVerdictVisible] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [cookieSettingsOpen, setCookieSettingsOpen] = useState(false);
  const isFinished = useRef(false);
  const verdictFetched = useRef(false);

  // Re-runs on each refresh via runKey
  useEffect(() => {
    /* FULL ACCURACY CONFIG — uncomment and remove FAST CONFIG below to restore the
       longer, more accurate test (~25 s). Matches the library's defaultConfig minus
       packetLoss (which fails with a CORS error on turn-creds).
    measurements: [
      { type: 'latency',  numPackets: 1 },
      { type: 'download', bytes: 1e5, count: 1, bypassMinDuration: true },
      { type: 'latency',  numPackets: 20 },
      { type: 'download', bytes: 1e5, count: 9 },
      { type: 'download', bytes: 1e6, count: 8 },
      { type: 'upload',   bytes: 1e5, count: 8 },
      { type: 'upload',   bytes: 1e6, count: 6 },
      { type: 'download', bytes: 1e7, count: 6 },
      { type: 'upload',   bytes: 1e7, count: 4 },
      { type: 'download', bytes: 25e6, count: 4 },
      { type: 'upload',   bytes: 25e6, count: 4 },
      { type: 'download', bytes: 1e8,  count: 3 },
      { type: 'upload',   bytes: 5e7,  count: 3 },
      { type: 'download', bytes: 25e7, count: 2 },
    ],
    */

    const engine = new SpeedTest({
      autoStart: false,
      // FAST CONFIG — targets ~8–12 s. Upload phases removed (not displayed).
      // Large download counts trimmed. 250 MB tier dropped (auto-skipped on fast
      // connections anyway; adds 15+ s on slow ones).
      measurements: [
        { type: 'latency',  numPackets: 1 },                              // ~20 ms
        { type: 'download', bytes: 1e5, count: 1, bypassMinDuration: true }, // warmup
        { type: 'download', bytes: 1e5, count: 3 },                       // was ×9
        { type: 'download', bytes: 1e6, count: 4 },                       // was ×8
        { type: 'download', bytes: 1e7, count: 4 },                       // was ×6 — ~1.2 s
        { type: 'download', bytes: 25e6, count: 2 },                      // was ×4 — ~1.5 s
        { type: 'download', bytes: 1e8,  count: 2 },                      // was ×3 — ~6 s
      ],
    });

    engine.onResultsChange = () => {
      if (isFinished.current) return;
      const bps = engine.results.getDownloadBandwidth();
      if (bps !== undefined) setDisplaySpeed(formatMbps(bps));
    };

    engine.onFinish = (results) => {
      isFinished.current = true;
      const bps = results.getDownloadBandwidth();
      // Use 0 when no reading — maps to tres_lent tier so verdict still fires
      setFinalDownloadMbps(bps !== undefined ? bps / 1e6 : 0);
      setDisplaySpeed(bps !== undefined ? formatMbps(bps) : '—');
      setStatus('done');
    };

    engine.play();

    return () => { engine.pause(); };
  }, [runKey]);

  // Trigger verdict once speed test AND lookup have both resolved
  useEffect(() => {
    if (status !== 'done' || finalDownloadMbps === null || lookup === null) return;
    if (verdictFetched.current) return;
    verdictFetched.current = true;

    setVerdictLoading(true);

    fetch('/api/verdict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speed: Math.round(finalDownloadMbps),
        isp: lookup.isp,
      }),
    })
      .then((res) => res.json())
      .then((data: { verdict: string }) => {
        setVerdict(data.verdict);
        setVerdictLoading(false);
        // Tiny delay so opacity-0 is painted before the transition fires
        setTimeout(() => setVerdictVisible(true), 50);
      })
      .catch(() => {
        setVerdict("Votre connexion a bien été testée. Pour naviguer en toute sécurité, pensez à utiliser un VPN afin de masquer votre adresse IP des regards indiscrets.");
        setVerdictLoading(false);
        setTimeout(() => setVerdictVisible(true), 50);
      });
  }, [status, finalDownloadMbps, lookup]);

  // Fetch IP / ISP / location independently of the speed test — re-runs on refresh
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    fetch('/api/lookup', { signal: controller.signal })
      .then((res) => res.json())
      .then((data: LookupData) => {
        clearTimeout(timeout);
        if (!cancelled) setLookup(data);
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!cancelled) setLookup({ ip: null, isp: null, city: null, country: null });
      });

    return () => { cancelled = true; controller.abort(); };
  }, [runKey]);

  function handleRestart() {
    // Reset all state and refs before mounting a fresh SpeedTest instance
    setDisplaySpeed('0');
    setFinalDownloadMbps(null);
    setStatus('running');
    setLookup(null);
    setVerdict(null);
    setVerdictLoading(false);
    setVerdictVisible(false);
    isFinished.current = false;
    verdictFetched.current = false;
    setRunKey((k) => k + 1);
  }

  return (
    // Slow connection accent: text-[#f87171] — apply to speed number and verdict card when speed is below threshold
    <main className="min-h-screen bg-[#0d0d0d] flex flex-col items-center px-4">

      {/* Branding header */}
      <header className="w-full flex justify-center pt-6 pb-2">
        <span className="text-xs tracking-widest text-neutral-600 uppercase select-none">
          Propulsé par INTERNET.FR
        </span>
      </header>

      {/* Hero section — vertically centered, occupies remaining space */}
      <section className="flex-1 flex flex-col items-center justify-center gap-5 w-full max-w-md py-8">

        {/* Intro label */}
        <p className="text-sm text-neutral-500 font-light tracking-wide">
          Votre vitesse de connexion est de
        </p>

        {/* Speed number + Mbps top-right */}
        <div className="flex items-start leading-none">
          <span className="text-[7rem] sm:text-[9rem] font-bold tracking-tighter text-white select-none leading-none">
            {displaySpeed}
          </span>
          <span className="text-lg sm:text-xl font-semibold text-[#22c55e] pt-3 sm:pt-4 pl-2 leading-none">
            Mbps
          </span>
        </div>

        {/* Pulsing dot — visible only while test is running */}
        <div className="h-3 flex items-center justify-center">
          {status === 'running' && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          )}
        </div>

        {/* Refresh icon — disabled while test is running to prevent stacked concurrent runs */}
        <button
          onClick={handleRestart}
          disabled={status === 'running'}
          aria-label="Relancer le test"
          className="text-neutral-500 hover:text-[#22c55e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
        >
          <RotateCw size={20} strokeWidth={1.5} />
        </button>

        {/* "Voir plus d'infos" — opens info modal */}
        <button
          onClick={() => setInfoOpen(true)}
          className="mt-1 px-6 py-2 rounded-full border border-neutral-700 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors"
        >
          Voir plus d&apos;infos
        </button>

        {/* Verdict card — supporting detail, below the primary interactive elements */}
        <div className="w-full rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] px-6 py-5 text-center shadow-xl mt-2">
          {verdictLoading ? (
            <p className="text-sm text-slate-500 font-light animate-pulse">
              Analyse en cours…
            </p>
          ) : verdict !== null ? (
            <p className={`text-sm text-neutral-300 font-light leading-relaxed transition-opacity duration-700 ${verdictVisible ? 'opacity-100' : 'opacity-0'}`}>
              {verdict}
            </p>
          ) : (
            <p className="text-sm text-slate-500 font-light">
              Verdict will appear here.
            </p>
          )}
        </div>

      </section>

      {/* IP / ISP / Location — discreet, just above the footer */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-4">
        <span className="text-xs text-neutral-600">
          IP: {lookup?.ip ?? '—'}
        </span>
        <span className="text-xs text-neutral-600">
          ISP: {lookup?.isp ?? '—'}
        </span>
        <span className="text-xs text-neutral-600">
          Location: {lookup
            ? ([lookup.city, lookup.country].filter(Boolean).join(', ') || '—')
            : '—'}
        </span>
      </div>

      {/* Footer */}
      <footer className="w-full flex justify-center items-center gap-1 pb-6 text-xs text-neutral-600">
        <span>Propulsé par Internet.fr</span>
        <span className="mx-1">|</span>
        <button
          onClick={() => setLegalOpen(true)}
          className="underline underline-offset-2 hover:text-neutral-400 transition-colors"
        >
          Mentions Légales &amp; RGPD
        </button>
        <span className="mx-1">|</span>
        <button
          onClick={() => setCookieSettingsOpen(true)}
          className="underline underline-offset-2 hover:text-neutral-400 transition-colors"
        >
          Cookies
        </button>
      </footer>

      {/* "Voir plus d'infos" modal */}
      <Modal isOpen={infoOpen} onClose={() => setInfoOpen(false)}>
        <p className="text-sm text-neutral-300 font-light leading-relaxed">
          De nouveaux outils et services exclusifs arrivent bientôt sur Internet.fr. Restez connectés&nbsp;!
        </p>
      </Modal>

      <CookieBanner
        externalSettingsOpen={cookieSettingsOpen}
        onExternalSettingsClose={() => setCookieSettingsOpen(false)}
      />

      {/* Legal / RGPD modal */}
      <Modal isOpen={legalOpen} onClose={() => setLegalOpen(false)}>
        <div className="space-y-4 text-sm">

          <h2 className="text-base font-semibold text-neutral-100 tracking-wide">
            Mentions Légales &amp; Politique de Confidentialité (RGPD)
          </h2>

          <section>
            <h3 className="font-semibold text-neutral-200 mb-1">1. Éditeur du site</h3>
            <p className="text-neutral-400 font-light leading-relaxed">
              Le site Internet.fr est édité par la société de Monsieur Xavier Thine, immatriculée au Registre du Commerce
              et des Sociétés (RCS) de Bayonne sous le numéro 928 248 517.
            </p>
            <p className="text-neutral-400 font-light leading-relaxed mt-1">
              Siège social : 1 allée des Jardins d&apos;Arcadie, 64600 Anglet, France.
            </p>
            <p className="text-neutral-400 font-light leading-relaxed mt-1">
              Représentant légal : Xavier Thine
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-neutral-200 mb-1">2. Hébergement du site</h3>
            <p className="text-neutral-400 font-light leading-relaxed">
              Le site est hébergé par la société Vercel Inc., située au 650 California St, San Francisco, CA 94108,
              États-Unis. La base de données technique est propulsée par Upstash, Inc.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-neutral-200 mb-1">3. Propriété intellectuelle</h3>
            <p className="text-neutral-400 font-light leading-relaxed">
              Tout le contenu du site Internet.fr (textes, graphismes, logos, icônes) est la propriété exclusive de
              l&apos;éditeur. Toute reproduction, même partielle, est strictement interdite sans l&apos;accord écrit de
              l&apos;éditeur.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-neutral-200 mb-1">4. Protection des données personnelles (RGPD) &amp; Cookies</h3>
            <p className="text-neutral-400 font-light leading-relaxed">
              Le site Internet.fr respecte la vie privée de ses utilisateurs.
            </p>
            <p className="text-neutral-400 font-light leading-relaxed mt-2">
              <span className="text-neutral-300 font-normal">Données collectées :</span> Dans le cadre de l&apos;exécution
              du test, le site traite de manière temporaire votre adresse IP pour interagir avec l&apos;infrastructure de
              test (Upstash Redis). Aucune donnée nominative n&apos;est collectée.
            </p>
            <p className="text-neutral-400 font-light leading-relaxed mt-2">
              <span className="text-neutral-300 font-normal">Droit des utilisateurs :</span> Conformément au règlement
              RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification et de suppression des données vous
              concernant en contactant le représentant légal au siège social.
            </p>
            <p className="text-neutral-400 font-light leading-relaxed mt-2">
              <span className="text-neutral-300 font-normal">Cookies :</span> Ce site utilise des cookies techniques
              indispensables à son bon fonctionnement et un bandeau de consentement conforme aux directives de la CNIL
              pour gérer vos préférences.
            </p>
          </section>

        </div>
      </Modal>

    </main>
  );
}
