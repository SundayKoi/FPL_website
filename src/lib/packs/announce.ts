// One door to the cards channel.
//
// Everything card-shaped that reaches Discord on its own initiative — a
// chase falling, a live window opening, a chase being armed — goes through
// here, so the webhook env is read in exactly one place and every embed
// fails the same soft way: these are announcements about things that
// ALREADY HAPPENED (or already changed state), and a webhook outage must
// never fail the thing itself.

import "server-only";

export interface CardsEmbed {
  title: string;
  description: string;
  color: number;
  /** A full-size image under the embed — the card itself, usually. */
  image?: { url: string };
}

export const GOLD = 0xe8c14b;
export const LIVE_RED = 0xff5063;

/** The league's cards channel (#cards in the FPL server). A constant
 *  rather than config because there is exactly one league; the env var
 *  overrides it if the channel ever moves without a deploy. */
const CARDS_CHANNEL_ID = "1542175819563016253";

/**
 * `content` is the plain line ABOVE the embed. A mention inside an embed
 * never notifies anyone — Discord renders it and stays silent — so a ping
 * that has to reach a phone (a fork waiting on an answer) goes here.
 */
export async function postCardsWebhook(embed: CardsEmbed, content?: string): Promise<void> {
  const webhook = process.env.DISCORD_CARDS_WEBHOOK_URL;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CARDS_CHANNEL_ID ?? CARDS_CHANNEL_ID;
  try {
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ embeds: [embed], ...(content ? { content } : {}) }),
      });
      return;
    }
    // No webhook configured: post as the bot itself, which the deploy
    // already authenticates for command registration. Same bot the /rip
    // command answers as, so the channel reads one voice.
    if (botToken) {
      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bot ${botToken}`,
        },
        body: JSON.stringify({ embeds: [embed], ...(content ? { content } : {}) }),
      });
    }
  } catch {
    // Garnish, by contract.
  }
}
