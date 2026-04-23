/**
 * Lovable AI Gateway helpers — server only.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type Message = { role: "system" | "user" | "assistant"; content: string };

export async function callAI(opts: {
  messages: Message[];
  model?: string;
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
}): Promise<{
  content: string | null;
  toolCall: { name: string; args: unknown } | null;
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const body: Record<string, unknown> = {
    model: opts.model ?? "google/gemini-3-flash-preview",
    messages: opts.messages,
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.tool_choice) body.tool_choice = opts.tool_choice;
  if (opts.temperature != null) body.temperature = opts.temperature;

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Top up Lovable AI workspace.");
    console.error("AI gateway error", res.status, text);
    throw new Error(`AI gateway error ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };

  const message = data.choices?.[0]?.message;
  let toolCall: { name: string; args: unknown } | null = null;
  if (message?.tool_calls?.[0]?.function) {
    const fn = message.tool_calls[0].function;
    try {
      toolCall = {
        name: fn.name ?? "",
        args: fn.arguments ? JSON.parse(fn.arguments) : {},
      };
    } catch {
      toolCall = null;
    }
  }

  return { content: message?.content ?? null, toolCall };
}
