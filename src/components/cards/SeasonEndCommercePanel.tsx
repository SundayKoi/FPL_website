"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CollectibleRenderer from "./CollectibleRenderer";
import type { SeasonEndCatalog } from "@/lib/season-end/collectibles";
import type { SeasonEndOwnedCopy } from "@/lib/season-end/release-queries";
import type { SeasonEndMarketListing, SeasonEndMarketWant, SeasonEndTradeOffer } from "@/lib/season-end/commerce-queries";
import {
  acceptSeasonEndTradeAction,
  buySeasonEndListingAction,
  cancelSeasonEndListingAction,
  cancelSeasonEndWantAction,
  createSeasonEndListingAction,
  createSeasonEndTradeAction,
  createSeasonEndWantAction,
  declineSeasonEndTradeAction,
  cancelSeasonEndTradeAction,
  dustSeasonEndCopyAction,
  fillSeasonEndWantAction,
  quoteSeasonEndDustAction,
} from "@/lib/season-end/commerce-actions";

type Market = { listings: SeasonEndMarketListing[]; wants: SeasonEndMarketWant[]; trades: SeasonEndTradeOffer[] };

function money(value: number): string {
  return value.toLocaleString("en-US");
}

function copyPull(copy: SeasonEndOwnedCopy) {
  return { design: copy.payload, foil: copy.foil, foilType: copy.foilType as never, signed: copy.signed, autograph: copy.autograph, guaranteedFoil: copy.slotPosition === 5, inventoryId: copy.inventoryId };
}

function parseIds(value: string): number[] {
  if (!value.trim()) return [];
  return value.split(",").map((part) => Number(part.trim()));
}

export default function SeasonEndCommercePanel({
  base,
  releaseId,
  catalog,
  copies,
  market,
  viewerId,
}: {
  base: string;
  releaseId: string;
  catalog: SeasonEndCatalog;
  copies: SeasonEndOwnedCopy[];
  market: Market;
  viewerId: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCopy, setSelectedCopy] = useState(String(copies[0]?.inventoryId ?? ""));
  const [ask, setAsk] = useState("500");
  const [bounty, setBounty] = useState("500");
  const [wantDesign, setWantDesign] = useState(catalog.designs[0]?.designId ?? "");
  const [target, setTarget] = useState("");
  const [offered, setOffered] = useState("");
  const [requested, setRequested] = useState("");
  const [offeredDollars, setOfferedDollars] = useState("0");
  const [requestedDollars, setRequestedDollars] = useState("0");
  const [armedListing, setArmedListing] = useState<number | null>(null);
  const [wantedCopyIds, setWantedCopyIds] = useState<Record<number, string>>({});

  function run(task: () => Promise<{ ok: boolean; error?: string; value?: number }>): void {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) setMessage(result.error ?? "That action could not be completed.");
      else router.refresh();
    });
  }

  function dust(copy: SeasonEndOwnedCopy): void {
    run(async () => {
      const quote = await quoteSeasonEndDustAction(copy.inventoryId);
      if (!quote.ok) return quote;
      if (!window.confirm(`Dust this copy for ${money(quote.value ?? 0)} betting dollars? This cannot be undone.`)) return { ok: false, error: "Dust cancelled." };
      return dustSeasonEndCopyAction(copy.inventoryId);
    });
  }

  return (
    <div className="flex flex-col gap-8" data-testid="season-end-commerce">
      {message ? <p role="alert" className="rounded border border-coral/60 bg-coral/10 p-3 text-sm text-coral">{message}</p> : null}
      <section className="card-brand flex flex-col gap-4 p-5">
        <div><p className="label-dash text-gold">Your public copies</p><h2 className="type-display mt-2 text-3xl">Dust, share, or trade</h2><p className="mt-2 text-sm text-steel">Admin-test copies never appear here. Every public copy keeps its frozen release rules and payload.</p></div>
        {copies.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{copies.map((copy) => <article key={copy.inventoryId} className="flex flex-col gap-2 rounded border border-line p-3"><CollectibleRenderer pull={copyPull(copy)} compact /><p className="text-xs text-gold">Copy #{copy.inventoryId} · {copy.foil ? `${copy.foilType ?? "foil"} foil` : "matte"}{copy.signed ? " · signed" : ""}</p><div className="flex flex-wrap gap-2 text-xs"><a href={`${base}/season-end/copy/${copy.inventoryId}`} className="text-coral underline-offset-4 hover:underline">Detail/share</a><button type="button" disabled={busy} onClick={() => dust(copy)} className="text-steel underline-offset-4 hover:text-coral hover:underline">Dust</button></div></article>)}</div> : <p className="text-sm text-steel">You do not own a public copy from this release yet.</p>}
      </section>

      <section className="card-brand grid gap-6 p-5 lg:grid-cols-2">
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); run(() => createSeasonEndListingAction({ inventoryId: Number(selectedCopy), ask: Number(ask) })); }}>
          <div><p className="label-dash text-gold">Fixed-price listing</p><h2 className="type-display mt-2 text-2xl">Sell one copy</h2></div>
          <label className="text-sm text-steel">Copy<select value={selectedCopy} onChange={(event) => setSelectedCopy(event.target.value)} className="mt-1 w-full rounded border border-line bg-panel p-2 text-white">{copies.map((copy) => <option key={copy.inventoryId} value={copy.inventoryId}>#{copy.inventoryId} · {copy.payload.display.title}</option>)}</select></label>
          <label className="text-sm text-steel">Ask<input inputMode="numeric" value={ask} onChange={(event) => setAsk(event.target.value)} className="mt-1 w-full rounded border border-line bg-panel p-2 text-white" /></label>
          <button type="submit" disabled={busy || !copies.length} className="w-fit rounded border border-gold px-4 py-2 text-sm text-gold disabled:opacity-50">List copy</button>
        </form>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); run(() => createSeasonEndWantAction({ releaseId, designId: wantDesign, bounty: Number(bounty) })); }}>
          <div><p className="label-dash text-gold">Wanted board</p><h2 className="type-display mt-2 text-2xl">Ask for a design</h2></div>
          <label className="text-sm text-steel">Design<select value={wantDesign} onChange={(event) => setWantDesign(event.target.value)} className="mt-1 w-full rounded border border-line bg-panel p-2 text-white">{catalog.designs.map((design) => <option key={design.designId} value={design.designId}>{design.display.title}</option>)}</select></label>
          <label className="text-sm text-steel">Bounty<input inputMode="numeric" value={bounty} onChange={(event) => setBounty(event.target.value)} className="mt-1 w-full rounded border border-line bg-panel p-2 text-white" /></label>
          <button type="submit" disabled={busy} className="w-fit rounded border border-gold px-4 py-2 text-sm text-gold disabled:opacity-50">Post wanted offer</button>
        </form>
      </section>

      <section className="card-brand flex flex-col gap-4 p-5">
        <div><p className="label-dash text-gold">For sale</p><h2 className="type-display mt-2 text-3xl">Season&apos;s End listings</h2></div>
        {market.listings.length ? <ul className="grid gap-3 md:grid-cols-2">{market.listings.map((listing) => <li key={listing.id} className="rounded border border-line p-3"><p className="text-sm text-white">{listing.copy?.payload.display.title ?? "Unavailable copy"}</p><p className="mt-1 text-xs text-steel">#{listing.inventoryId} · {listing.copy?.foil ? `${listing.copy.foilType ?? "foil"} foil` : "matte"} · {listing.sellerName} · {money(listing.ask)} dollars</p>{listing.note ? <p className="mt-2 text-xs text-steel">{listing.note}</p> : null}<button type="button" disabled={busy || listing.stale || listing.sellerDiscordId === viewerId} onClick={() => { if (armedListing !== listing.id) { setArmedListing(listing.id); return; } run(() => buySeasonEndListingAction(listing.id)); }} className="mt-3 rounded border border-gold px-3 py-1.5 text-xs text-gold disabled:opacity-50">{listing.sellerDiscordId === viewerId ? "Your listing" : listing.stale ? "Unavailable" : armedListing === listing.id ? `Confirm ${money(listing.ask)}` : `Buy for ${money(listing.ask)}`}</button>{listing.sellerDiscordId === viewerId ? <button type="button" disabled={busy} onClick={() => run(() => cancelSeasonEndListingAction(listing.id))} className="ml-2 text-xs text-steel hover:text-coral">Cancel</button> : null}</li>)}</ul> : <p className="text-sm text-steel">No public copies are listed right now.</p>}
      </section>

      <section className="card-brand flex flex-col gap-4 p-5">
        <div><p className="label-dash text-gold">Wanted</p><h2 className="type-display mt-2 text-3xl">Collectors looking for a copy</h2></div>
        {market.wants.length ? <ul className="grid gap-3 md:grid-cols-2">{market.wants.map((want) => { const matching = copies.filter((copy) => copy.designId === want.designId); const storedCopyId = wantedCopyIds[want.id]; const selectedCopyId = storedCopyId && matching.some((copy) => String(copy.inventoryId) === storedCopyId) ? storedCopyId : String(matching[0]?.inventoryId ?? ""); return <li key={want.id} className="rounded border border-line p-3"><p className="text-sm text-white">{catalog.designs.find((design) => design.designId === want.designId)?.display.title ?? want.designId}</p><p className="mt-1 text-xs text-steel">{want.name} · bounty {money(want.bounty)}</p>{want.discordId === viewerId ? <button type="button" disabled={busy} onClick={() => run(() => cancelSeasonEndWantAction(want.id))} className="mt-3 text-xs text-steel hover:text-coral">Cancel</button> : matching.length ? <div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs text-steel">Copy<select aria-label={`Copy for ${want.name}'s wanted offer`} value={selectedCopyId} onChange={(event) => setWantedCopyIds((current) => ({ ...current, [want.id]: event.target.value }))} className="ml-2 rounded border border-line bg-panel px-2 py-1 text-xs text-white">{matching.map((copy) => <option key={copy.inventoryId} value={copy.inventoryId}>#{copy.inventoryId} · {copy.foil ? `${copy.foilType ?? "foil"} foil` : "matte"}{copy.signed ? " · signed" : ""}</option>)}</select></label><button type="button" disabled={busy} onClick={() => run(() => fillSeasonEndWantAction(want.id, Number(selectedCopyId)))} className="rounded border border-gold px-3 py-1.5 text-xs text-gold">Fill selected copy</button></div> : null}</li>; })}</ul> : <p className="text-sm text-steel">No wanted offers are open for this release.</p>}
      </section>

      <section className="card-brand flex flex-col gap-4 p-5">
        <div><p className="label-dash text-gold">Direct trades</p><h2 className="type-display mt-2 text-3xl">Offer a swap</h2><p className="mt-2 text-sm text-steel">Use a Discord id, comma-separated copy ids, and optional dollar legs. Postgres re-checks ownership and locks every copy in deterministic order when accepted.</p></div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); run(() => createSeasonEndTradeAction({ releaseId, toDiscordId: target.trim(), offeredInventoryIds: parseIds(offered), requestedInventoryIds: parseIds(requested), offeredDollars: Number(offeredDollars), requestedDollars: Number(requestedDollars) })); }}>
          <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Recipient Discord id" className="rounded border border-line bg-panel p-2 text-sm text-white" />
          <input value={offered} onChange={(event) => setOffered(event.target.value)} placeholder="Your copy ids: 123, 456" className="rounded border border-line bg-panel p-2 text-sm text-white" />
          <input value={requested} onChange={(event) => setRequested(event.target.value)} placeholder="Requested copy ids" className="rounded border border-line bg-panel p-2 text-sm text-white" />
          <div className="flex gap-2"><input value={offeredDollars} onChange={(event) => setOfferedDollars(event.target.value)} placeholder="You add dollars" className="min-w-0 flex-1 rounded border border-line bg-panel p-2 text-sm text-white" /><input value={requestedDollars} onChange={(event) => setRequestedDollars(event.target.value)} placeholder="They add dollars" className="min-w-0 flex-1 rounded border border-line bg-panel p-2 text-sm text-white" /></div>
          <button type="submit" disabled={busy} className="w-fit rounded border border-gold px-4 py-2 text-sm text-gold disabled:opacity-50">Send trade offer</button>
        </form>
        {market.trades.length ? <ul className="grid gap-3 md:grid-cols-2">{market.trades.map((trade) => <li key={trade.id} className="rounded border border-line p-3 text-sm"><p className="text-white">{trade.fromName} → {trade.toName}</p><p className="mt-1 text-xs text-steel">Offer #{trade.id} · copies {trade.offeredInventoryIds.join(", ") || "none"} for {trade.requestedInventoryIds.join(", ") || "none"} · dollars {money(trade.offeredDollars)} / {money(trade.requestedDollars)}</p>{trade.toDiscordId === viewerId ? <div className="mt-3 flex gap-3"><button type="button" disabled={busy} onClick={() => run(() => acceptSeasonEndTradeAction(trade.id))} className="rounded border border-gold px-3 py-1.5 text-xs text-gold">Accept</button><button type="button" disabled={busy} onClick={() => run(() => declineSeasonEndTradeAction(trade.id))} className="text-xs text-steel hover:text-coral">Decline</button></div> : trade.fromDiscordId === viewerId ? <button type="button" disabled={busy} onClick={() => run(() => cancelSeasonEndTradeAction(trade.id))} className="mt-3 text-xs text-steel hover:text-coral">Withdraw</button> : null}</li>)}</ul> : <p className="text-sm text-steel">No pending direct trades for this release.</p>}
      </section>
    </div>
  );
}
