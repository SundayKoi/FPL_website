"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ChatRow = {
  id: number;
  profile_id: string | null;
  body: string;
  created_at: string;
};

const QUICK_EMOJI = ["🔥", "😂", "💀", "👑", "🐐", "💰"] as const;

function friendlyChatError(message: string): string {
  if (message.includes("TOO_FAST")) return "Slow down a little — one message every couple of seconds.";
  if (message.includes("SIGN_IN")) return "Sign in to chat.";
  if (message.includes("BAD_BODY")) return "Messages need to be 1–300 characters.";
  return "Couldn't send that — try again.";
}

/** Board chat: any signed-in viewer talks, everyone reads. System lines
 * (skips, auto-assigns) come from the engine with no author. */
export default function DraftChat({
  draftId,
  profileId,
  isAdmin,
  className = "",
}: {
  draftId: string;
  profileId: string | null;
  isAdmin: boolean;
  className?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);

  const loadNames = useCallback(
    async (rows: ChatRow[]) => {
      const unknown = [...new Set(rows.map((r) => r.profile_id).filter((id): id is string => !!id))];
      if (unknown.length === 0) return;
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", unknown);
      if (data) {
        setNames((current) => {
          const next = { ...current };
          for (const p of data as { id: string; display_name: string }[]) next[p.id] = p.display_name;
          return next;
        });
      }
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("draft_chat")
      .select("id, profile_id, body, created_at")
      .eq("draft_id", draftId)
      .order("id", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const rows = (data as ChatRow[]).reverse();
        setMessages(rows);
        void loadNames(rows);
      });

    const channel = supabase
      .channel(`draft-chat:${draftId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_chat", filter: `draft_id=eq.${draftId}` },
        (payload) => {
          const row = payload.new as ChatRow;
          if (row.id == null) return;
          setMessages((current) =>
            current.some((m) => m.id === row.id) ? current : [...current, row].slice(-100),
          );
          void loadNames([row]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "draft_chat", filter: `draft_id=eq.${draftId}` },
        (payload) => {
          const oldId = (payload.old as { id?: number }).id;
          if (oldId == null) return;
          setMessages((current) => current.filter((m) => m.id !== oldId));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, draftId, loadNames]);

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("post_draft_chat", {
      p_draft_id: draftId,
      p_body: body,
    });
    setSending(false);
    if (rpcError) {
      setError(friendlyChatError(rpcError.message));
      return;
    }
    setInput("");
  }

  async function remove(id: number) {
    await supabase.from("draft_chat").delete().eq("id", id);
  }

  return (
    <section aria-label="Draft chat" className={`card-brand flex flex-col p-0 ${className}`}>
      <div className="border-b border-line px-4 py-2">
        <span className="label-dash">CHAT</span>
      </div>

      <ul
        ref={listRef}
        className="max-h-64 min-h-32 space-y-1.5 overflow-y-auto px-4 py-3 text-sm lg:min-h-0 lg:max-h-none lg:flex-1"
      >
        {messages.length === 0 && <li className="text-steel">Nothing yet — say something.</li>}
        {messages.map((m) =>
          m.profile_id === null ? (
            <li key={m.id} className="text-center text-xs text-gold/80">
              {m.body}
            </li>
          ) : (
            <li key={m.id} className="group flex items-baseline gap-2">
              <span className="shrink-0 font-semibold text-steel">
                {names[m.profile_id] ?? "…"}
              </span>
              <span className="min-w-0 break-words text-white">{m.body}</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  aria-label="Delete message"
                  className="ml-auto hidden shrink-0 text-xs text-red-400 hover:text-red-300 group-hover:block"
                >
                  ✕
                </button>
              )}
            </li>
          ),
        )}
      </ul>

      {profileId ? (
        <div className="border-t border-line p-3">
          <div className="mb-2 flex gap-1">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setInput((v) => v + emoji)}
                aria-label={`Add ${emoji}`}
                className="rounded px-1.5 py-0.5 text-base transition hover:bg-line/40"
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              maxLength={300}
              placeholder="Talk to the room…"
              aria-label="Chat message"
              className="min-w-0 flex-1 rounded border border-line bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-steel/60"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              className="btn-pill text-sm disabled:opacity-40"
            >
              Send
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="border-t border-line px-4 py-3 text-xs text-steel">
          Sign in to join the chat.
        </div>
      )}
    </section>
  );
}
