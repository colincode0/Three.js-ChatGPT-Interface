import { OpenAIStream, StreamingTextResponse } from "ai";
import OpenAI from "openai";

// Create an OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Use Node.js runtime instead of edge for better OpenAI API compatibility
export const runtime = "nodejs";

interface OpenAIError {
  status?: number;
  message?: string;
}

// Temporary: skip OpenAI and stream a fixed reply while testing locally
const USE_MOCK_REPLY = true;
const MOCK_REPLY = "this is a test reply";

export async function POST(req: Request) {
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

  try {
    const { messages } = await req.json();

    // Validate input
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid messages format" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create a chat completion with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await openai.chat.completions.create(
      {
        model: "gpt-4-turbo-preview",
        stream: true,
        messages: messages,
        temperature: 0.7, // Slightly reduce randomness
      },
      {
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response);

    // Return a StreamingTextResponse, which can be consumed by the client
    return new StreamingTextResponse(stream);
  } catch (error: unknown) {
    console.error("OpenAI API Error:", error);

    // Handle timeout/abort errors
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(
        JSON.stringify({
          error: "Request timed out. Please try again.",
        }),
        {
          status: 408,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const openAIError = error as OpenAIError;

    // Handle quota exceeded error
    if (openAIError.status === 429) {
      return new Response(
        JSON.stringify({
          error:
            "API quota exceeded. Please check your OpenAI account billing and quota.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Handle authentication errors
    if (openAIError.status === 401) {
      return new Response(
        JSON.stringify({
          error: "Invalid API key. Please check your OpenAI configuration.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Handle other errors
    return new Response(
      JSON.stringify({
        error: "An error occurred while processing your request.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
