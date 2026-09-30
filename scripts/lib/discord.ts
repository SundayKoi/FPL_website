// Scripts post their own Discord embeds: src/lib/packs/announce.ts is
// `server-only` and throws the moment a plain node script imports it.

export interface WebhookEmbed {
  title: string;
  /** Truncated to Discord's 4000-character embed description limit. */
  description: string;
  color: number;
  footer?: string;
}

/** Posts one embed to a Discord webhook, throwing on a non-2xx reply. */
export async function postWebhookEmbed(webhookUrl: string, { title, description, color, footer }: WebhookEmbed): Promise<void> {
  const embed = {
    title,
    description: description.slice(0, 4000),
    color,
    ...(footer === undefined ? {} : { footer: { text: footer } }),
  };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}
