import { OpenAIStream, StreamingTextResponse } from "ai";
import OpenAI from "openai";
import {
  MAX_ASSISTANT_MESSAGE_CHARS,
  MAX_BODY_BYTES,
  MAX_HISTORY_MESSAGES,
  MAX_REPLY_TOKENS,
  MAX_USER_MESSAGE_CHARS,
} from "@/lib/chatLimits";
import { SYSTEM_PROMPT } from "./systemPrompt";

// Create an OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Use Node.js runtime instead of edge for better OpenAI API compatibility
export const runtime = "nodejs";

// Covers the whole request, including a stream that stalls partway
const REQUEST_TIMEOUT_MS = 30000;

// Temporary: skip OpenAI and stream a fixed reply while testing locally
const USE_MOCK_REPLY = true;
const MOCK_REPLY = "this is a test reply";

interface OpenAIError {
  status?: number;
  message?: string;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Only accept requests made from this site's own pages. Browsers always send
// Origin on POST, so this blocks other websites from using the endpoint
// (scripts can still forge it - rate limiting is the real defense there).
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Keep only well-formed user/assistant messages from the recent history.
// Returns an error message instead when the request should be rejected.
function sanitizeMessages(input: unknown): ChatMessage[] | string {
  if (!Array.isArray(input) || input.length === 0) {
    return "Invalid messages format";
  }

  const recent = input.slice(-MAX_HISTORY_MESSAGES);
  const messages: ChatMessage[] = [];

  for (const message of recent) {
    if (typeof message !== "object" || message === null) {
      return "Invalid messages format";
    }
    const { role, content } = message as Record<string, unknown>;
    // Drops "system" and any other role a client might try to inject
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) {
      return "Invalid messages format";
    }
    const maxChars =
      role === "user" ? MAX_USER_MESSAGE_CHARS : MAX_ASSISTANT_MESSAGE_CHARS;
    if (content.length > maxChars) {
      return `Messages must be ${maxChars} characters or fewer`;
    }
    messages.push({ role, content });
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return "The last message must be from the user";
  }
  return messages;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, "Forbidden");
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError(413, "Request too large");
  }

  let body: unknown;
  try {
    const raw = await req.text();
    // Content-Length can be missing (chunked) or wrong, so check again
    if (raw.length > MAX_BODY_BYTES) {
      return jsonError(413, "Request too large");
    }
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const messages = sanitizeMessages(
    (body as { messages?: unknown } | null)?.messages
  );
  if (typeof messages === "string") {
    return jsonError(400, messages);
  }

  if (USE_MOCK_REPLY) {
    return new StreamingTextResponse(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(MOCK_REPLY));
          controller.close();
        },
      })
    );
  }

  // Abort the OpenAI call on timeout, or when the visitor disconnects
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  req.signal.addEventListener("abort", () => controller.abort());

  try {
    const response = await openai.chat.completions.create(
      {
        model: "gpt-4-turbo-preview",
        stream: true,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: MAX_REPLY_TOKENS,
        temperature: 0.7, // Slightly reduce randomness
      },
      {
        signal: controller.signal,
      }
    );

    // Convert the response into a friendly text-stream; the timeout stays
    // armed until the stream has fully finished
    const stream = OpenAIStream(response, {
      onFinal: () => clearTimeout(timeoutId),
    });

    // Return a StreamingTextResponse, which can be consumed by the client
    return new StreamingTextResponse(stream);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    console.error("OpenAI API Error:", error);

    // Handle timeout/abort errors (the SDK wraps aborts in its own error type)
    if (
      error instanceof OpenAI.APIUserAbortError ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return jsonError(408, "Request timed out. Please try again.");
    }

    const openAIError = error as OpenAIError;

    // Handle quota exceeded error
    if (openAIError.status === 429) {
      return jsonError(
        429,
        "The service is busy right now. Please try again later."
      );
    }

    // Authentication errors are a server misconfiguration - don't reveal it
    return jsonError(500, "An error occurred while processing your request.");
  }
}
