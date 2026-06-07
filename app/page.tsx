'use client';

import { useEffect, useRef, useState } from 'react';
import SpeedTest from '@cloudflare/speedtest';

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
  const [displaySpeed, setDisplaySpeed] = useState<string>('0');
  const [finalDownloadMbps, setFinalDownloadMbps] = useState<number | null>(null); // used by later phases
  const [status, setStatus] = useState<Status>('running');
  const [lookup, setLookup] = useState<LookupData | null>(null); // null = still loading
  const isFinished = useRef(false);

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
      const mbps = bps !== undefined ? bps / 1e6 : null;
      setFinalDownloadMbps(mbps);
      setDisplaySpeed(bps !== undefined ? formatMbps(bps) : '—');
      setStatus('done');
    };

    engine.play();

    return () => { engine.pause(); };
  }, []);

  void finalDownloadMbps; // used by later phases

  // Fetch IP / ISP / location independently of the speed test
  useEffect(() => {
    let cancelled = false;

    fetch('/api/lookup')
      .then((res) => res.json())
      .then((data: LookupData) => {
        console.log('[lookup] client received:', data); // DEBUG
        if (!cancelled) setLookup(data);
      })
      .catch(() => {
        if (!cancelled) setLookup({ ip: null, isp: null, city: null, country: null });
      });

    return () => { cancelled = true; };
  }, []);

  return (
    // Slow connection accent: text-[#f87171] — apply to speed number and verdict card when speed is below threshold
    <main className="flex-1 min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-between px-4 py-10">

      {/* Hero section — centered */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full max-w-md">

        {/* Speed number */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-end gap-2 leading-none">
            <span className="text-[7rem] sm:text-[10rem] font-thin tracking-tighter text-white select-none">
              {displaySpeed}
            </span>
            <span className="text-xl sm:text-2xl font-light text-[#22c55e] mb-4 sm:mb-7">
              Mbps
            </span>
          </div>

          {/* Pulsing dot — visible only while test is running */}
          <div className="h-4 flex items-center justify-center">
            {status === 'running' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            )}
          </div>
        </div>

        {/* Info row */}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          <span className="text-sm text-neutral-400">
            IP: {lookup?.ip ?? '—'}
          </span>
          <span className="text-sm text-neutral-400">
            ISP: {lookup?.isp ?? '—'}
          </span>
          <span className="text-sm text-neutral-400">
            Location: {lookup
              ? ([lookup.city, lookup.country].filter(Boolean).join(', ') || '—')
              : '—'}
          </span>
        </div>

        {/* Verdict card */}
        <div className="w-full rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] px-6 py-5 text-center shadow-xl">
          <p className="text-sm text-slate-500 font-light">Verdict will appear here.</p>
        </div>

      </div>

      {/* Bottom chrome — ads + VPN CTA */}
      <div className="w-full max-w-md flex flex-col items-center gap-3 pt-6">

        {/* VPN affiliate CTA */}
        <a
          href="#"
          className="w-full sm:w-auto px-8 py-2.5 rounded-full bg-[#22c55e] hover:bg-[#16a34a] active:bg-[#15803d] text-black text-sm font-medium transition-colors text-center"
        >
          Protect your connection
        </a>

        {/* Ad slots */}
        <div className="w-full flex flex-col sm:flex-row gap-2">
          <div className="flex-1 h-14 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <span className="text-xs text-neutral-600 uppercase tracking-widest">Ad slot</span>
          </div>
          <div className="flex-1 h-14 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <span className="text-xs text-neutral-600 uppercase tracking-widest">Ad slot</span>
          </div>
        </div>

      </div>

    </main>
  );
}
