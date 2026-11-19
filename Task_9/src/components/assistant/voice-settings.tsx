"use client";

import { Play } from "lucide-react";
import { REPLY_LANGUAGES, chooseVoice, voicesFor, type ReplyLang } from "@/lib/voice/voice-choice";
import { Button } from "@/components/ui/button";

interface InstalledVoice {
  name: string;
  lang: string;
}

const SPEEDS = [
  { value: 0.85, label: "Slower" },
  { value: 1, label: "Normal" },
  { value: 1.15, label: "Faster" },
];

const selectClass =
  "min-h-8 w-full min-w-0 rounded-md border border-[#dce5f0] bg-white px-2 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#1769e8]/40";

/**
 * The "Voice" menu: pick which installed voice reads the replies in each language, hear a sample, and set the
 * speed. The default is a natural female Indian voice; the choice is remembered in this browser.
 */
export function VoiceSettings({
  voices,
  chosen,
  rate,
  onPick,
  onRate,
  onPreview,
}: {
  voices: InstalledVoice[];
  /** The voice names the user picked, per language (missing means "use the best default"). */
  chosen: Partial<Record<ReplyLang, string>>;
  rate: number;
  onPick: (lang: ReplyLang, name: string) => void;
  onRate: (rate: number) => void;
  onPreview: (lang: ReplyLang) => void;
}) {
  return (
    <div className="space-y-2.5 border-b border-[#e6ebf2] bg-[#f8fbff] px-4 py-3 sm:px-5" role="group" aria-label="Assistant voice settings">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-900">Assistant voice</p>
        <p className="text-[10px] text-slate-500">Remembered on this device</p>
      </div>

      {voices.length === 0 ? (
        <p className="text-xs text-slate-600">
          This browser has no speech voices installed. Try Chrome or Edge, or add voices in your system settings.
        </p>
      ) : (
        REPLY_LANGUAGES.map(({ lang, label }) => {
          const options = voicesFor(voices, lang);
          const effective = chooseVoice(voices, lang, chosen[lang]);
          return (
            <div key={lang} className="flex items-center gap-2">
              <label htmlFor={`voice-${lang}`} className="w-14 shrink-0 text-[11px] font-semibold text-slate-700">
                {label}
              </label>
              {options.length === 0 ? (
                <span className="text-[11px] text-slate-500">No voice installed for this language</span>
              ) : (
                <select
                  id={`voice-${lang}`}
                  value={effective?.name ?? ""}
                  onChange={(e) => onPick(lang, e.target.value)}
                  className={selectClass}
                >
                  {options.map((v, i) => (
                    <option key={v.name} value={v.name}>
                      {v.name.replace(/^(Microsoft|Google)\s+/i, "")}
                      {i === 0 && !chosen[lang] ? " (recommended)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onPreview(lang)}
                disabled={options.length === 0}
                aria-label={`Hear the ${label} voice`}
                className="min-h-8 shrink-0 gap-1 px-2.5 text-[11px]"
              >
                <Play size={11} /> Hear
              </Button>
            </div>
          );
        })
      )}

      {voices.length > 0 && !REPLY_LANGUAGES.every(({ lang }) => voicesFor(voices, lang).length > 0 && voicesFor(voices, lang)[0].lang === lang) && (
        <p className="rounded-md bg-white px-2.5 py-2 text-[11px] leading-snug text-slate-600">
          <b>Want a natural Indian voice?</b> Open this page in <b>Microsoft Edge</b> (it includes free natural voices such as Neerja,
          Swara and Aarohi), or on Windows add them in <b>Settings, Time &amp; language, Speech, Add voices</b>.
        </p>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="voice-rate" className="w-14 shrink-0 text-[11px] font-semibold text-slate-700">
          Speed
        </label>
        <select id="voice-rate" value={rate} onChange={(e) => onRate(Number(e.target.value))} className={selectClass}>
          {SPEEDS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
