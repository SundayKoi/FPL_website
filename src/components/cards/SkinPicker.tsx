"use client";

// Card customization: which of the signature champion's skins the card
// wears, the motto line on the back, and the player's autograph. Rendered
// only for viewers the
// server says may edit (the card's captain or an admin — see
// can_edit_card_art in 20260826000013); RLS re-checks on write. Skin
// numbers are probed optimistically 1..MAX and thumbnails that 404 remove
// themselves — Riot's skin nums are sparse and undocumented.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import SignaturePad from "./SignaturePad";

const MAX_SKIN_PROBE = 20;
const MOTTO_MAX = 60;

export default function SkinPicker({
  season,
  summonerName,
  tag,
  champion,
  currentSkin,
  currentMotto = null,
  currentSignature = null,
}: {
  season: string;
  summonerName: string;
  tag: string;
  champion: string;
  currentSkin: number;
  currentMotto?: string | null;
  currentSignature?: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const [motto, setMotto] = useState(currentMotto ?? "");

  const save = async (patch: { skin?: number; motto?: string | null }) => {
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("card_art_prefs")
      .upsert({ season, summoner_name: summonerName, tag, ...patch }, { onConflict: "season,summoner_name,tag" });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    router.refresh();
  };

  const saveMotto = () => {
    // Printable characters only, trimmed, capped at the column's check.
    const cleaned = [...motto]
      .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
      .join("")
      .trim()
      .slice(0, MOTTO_MAX);
    setMotto(cleaned);
    return save({ motto: cleaned || null });
  };

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
      >
        {open ? "Close customizer" : "Customize card"}
      </button>
      {open ? (
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full max-w-md flex-col gap-1">
            <label htmlFor="card-motto" className="text-xs text-steel">
              Motto — one line on the card back ({MOTTO_MAX} characters max)
            </label>
            <div className="flex gap-2">
              <input
                id="card-motto"
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                maxLength={MOTTO_MAX}
                placeholder={'"I don\'t ward, I win."'}
                className="input-brand min-w-0 flex-1 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={saving || (currentMotto ?? "") === motto.trim()}
                onClick={() => void saveMotto()}
                className="btn-coral px-4 py-2 text-xs disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-2">
            <span className="label-dash">Signature</span>
            <p className="text-center text-xs text-steel">
              Sign your card — roughly 1 in 100 of your pulls comes out autographed.
            </p>
            <SignaturePad season={season} summonerName={summonerName} tag={tag} currentSignature={currentSignature} />
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-steel">Pick which {champion} art this card wears.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: MAX_SKIN_PROBE + 1 }, (_, skin) => skin)
                .filter((skin) => !broken.has(skin))
                .map((skin) => {
                  const url = championCenteredUrl(champion, skin);
                  if (!url) return null;
                  const active = skin === currentSkin;
                  return (
                    <button
                      key={skin}
                      type="button"
                      disabled={saving || active}
                      onClick={() => void save({ skin })}
                      aria-pressed={active}
                      className={`relative h-16 w-28 overflow-hidden rounded border transition ${
                        active ? "border-coral ring-2 ring-coral/60" : "border-line hover:border-coral"
                      } disabled:cursor-default`}
                      title={skin === 0 ? "Base splash" : `Skin ${skin}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover object-[center_20%]"
                        loading="lazy"
                        onError={() => setBroken((current) => new Set(current).add(skin))}
                      />
                      {active ? (
                        <span className="absolute inset-x-0 bottom-0 bg-coral/90 text-[9px] font-bold uppercase text-navy">In use</span>
                      ) : null}
                    </button>
                  );
                })}
            </div>
          </div>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
