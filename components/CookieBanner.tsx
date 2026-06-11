'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';

interface ConsentData {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
  version: 1;
}

const STORAGE_KEY = 'cookieConsent';

function saveConsent(analytics: boolean, marketing: boolean) {
  const data: ConsentData = {
    necessary: true,
    analytics,
    marketing,
    timestamp: new Date().toISOString(),
    version: 1,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

interface Props {
  externalSettingsOpen: boolean;
  onExternalSettingsClose: () => void;
}

export default function CookieBanner({ externalSettingsOpen, onExternalSettingsClose }: Props) {
  // undefined = not yet read from localStorage (server/first paint)
  // null      = read, no consent stored → show banner
  // object    = read, consent exists → hide banner
  const [consent, setConsent] = useState<ConsentData | null | undefined>(undefined);
  const [bannerMounted, setBannerMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  // Read localStorage once on mount — never on the server
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ConsentData;
        setConsent(parsed);
        setAnalyticsEnabled(parsed.analytics);
        setMarketingEnabled(parsed.marketing);
      } catch {
        setConsent(null);
      }
    } else {
      setConsent(null);
    }
  }, []);

  // Slide-up entrance: render with translate-y-full, then flip after one frame
  useEffect(() => {
    if (consent !== null) return;
    const id = setTimeout(() => setBannerMounted(true), 10);
    return () => clearTimeout(id);
  }, [consent]);

  // Sync toggle defaults when external settings opens (show current saved prefs)
  useEffect(() => {
    if (externalSettingsOpen && consent && typeof consent === 'object') {
      setAnalyticsEnabled(consent.analytics);
      setMarketingEnabled(consent.marketing);
    }
  }, [externalSettingsOpen, consent]);

  function acceptAll() {
    const saved = saveConsent(true, true);
    setConsent(saved);
  }

  function rejectAll() {
    const saved = saveConsent(false, false);
    setConsent(saved);
  }

  function openSettings() {
    // Seed toggles from current saved state (or defaults if no consent yet)
    if (consent && typeof consent === 'object') {
      setAnalyticsEnabled(consent.analytics);
      setMarketingEnabled(consent.marketing);
    } else {
      setAnalyticsEnabled(false);
      setMarketingEnabled(false);
    }
    setSettingsOpen(true);
  }

  function savePreferences() {
    const saved = saveConsent(analyticsEnabled, marketingEnabled);
    setConsent(saved);
    setSettingsOpen(false);
    onExternalSettingsClose();
  }

  function handleSettingsClose() {
    setSettingsOpen(false);
    onExternalSettingsClose();
  }

  const modalOpen = settingsOpen || externalSettingsOpen;
  const bannerVisible = consent === null;

  return (
    <>
      {/* Banner — fixed bottom, slides up on first visit */}
      {bannerVisible && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-500 ease-out ${
            bannerMounted ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="max-w-2xl mx-auto bg-[#1a1a1a] border border-b-0 border-[#2a2a2a] rounded-t-2xl px-5 py-3 shadow-2xl">
            {/* Desktop: text left, buttons right. Mobile: stacked. */}
            <div className="sm:flex sm:items-center sm:gap-6">
              <div className="flex-1 min-w-0 mb-2 sm:mb-0">
                <h2 className="text-sm font-semibold text-neutral-100 mb-0.5">
                  Votre vie privée
                </h2>
                <p className="text-xs text-neutral-400 font-light leading-relaxed">
                  Nous utilisons des cookies pour assurer le bon fonctionnement de ce site et améliorer votre expérience.
                  Vous pouvez accepter, refuser ou personnaliser vos préférences à tout moment, conformément aux directives de la CNIL.
                </p>
              </div>

              {/* CNIL: Accept and Reject are identical in size and prominence */}
              <div className="flex flex-wrap gap-2 flex-shrink-0">
                <button
                  onClick={acceptAll}
                  className="px-5 py-1.5 rounded-full border border-neutral-600 text-xs text-neutral-200 hover:border-neutral-400 hover:text-white transition-colors"
                >
                  Accepter tout
                </button>
                <button
                  onClick={rejectAll}
                  className="px-5 py-1.5 rounded-full border border-neutral-600 text-xs text-neutral-200 hover:border-neutral-400 hover:text-white transition-colors"
                >
                  Refuser tout
                </button>
                <button
                  onClick={openSettings}
                  className="px-5 py-1.5 rounded-full text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Personnaliser
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal — opened from banner "Personnaliser" or footer "Cookies" link */}
      <Modal isOpen={modalOpen} onClose={handleSettingsClose}>
        <div className="space-y-5 text-sm">
          <h2 className="text-base font-semibold text-neutral-100">
            Préférences de cookies
          </h2>

          {/* Strictly necessary — always on, locked */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-neutral-200 font-medium text-xs">Strictement nécessaires</p>
              <p className="text-neutral-500 font-light text-xs mt-0.5 leading-relaxed">
                Ces cookies sont indispensables au fonctionnement du site (tests de connexion, mise en cache des résultats). Ils ne peuvent pas être désactivés.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={true}
              disabled
              className="relative flex-shrink-0 mt-0.5 w-11 h-6 rounded-full bg-[#22c55e] opacity-50 cursor-not-allowed"
              aria-label="Strictement nécessaires — toujours actif"
            >
              <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white" />
            </button>
          </div>

          <div className="border-t border-[#2a2a2a]" />

          {/* Analytics */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-neutral-200 font-medium text-xs">Analytiques</p>
              <p className="text-neutral-500 font-light text-xs mt-0.5 leading-relaxed">
                Ces cookies nous permettraient de mesurer l&apos;audience du site de manière anonyme. Actuellement non utilisés.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={analyticsEnabled}
              onClick={() => setAnalyticsEnabled((v) => !v)}
              className={`relative flex-shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors ${
                analyticsEnabled ? 'bg-[#22c55e]' : 'bg-neutral-700'
              }`}
              aria-label="Cookies analytiques"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  analyticsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-[#2a2a2a]" />

          {/* Marketing */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-neutral-200 font-medium text-xs">Marketing</p>
              <p className="text-neutral-500 font-light text-xs mt-0.5 leading-relaxed">
                Ces cookies permettraient de proposer des offres et services personnalisés. Actuellement non utilisés.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={marketingEnabled}
              onClick={() => setMarketingEnabled((v) => !v)}
              className={`relative flex-shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors ${
                marketingEnabled ? 'bg-[#22c55e]' : 'bg-neutral-700'
              }`}
              aria-label="Cookies marketing"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  marketingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <button
            onClick={savePreferences}
            className="w-full mt-2 px-5 py-2.5 rounded-full border border-[#22c55e] text-[#22c55e] text-xs font-medium hover:bg-[#22c55e] hover:text-black transition-colors"
          >
            Enregistrer mes préférences
          </button>
        </div>
      </Modal>
    </>
  );
}
