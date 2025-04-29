import { OpenAIStream, StreamingTextResponse } from "ai";
import OpenAI from "openai";

// Create an OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "edge";

interface OpenAIError {
  status?: number;
  message?: string;
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Add system message to encourage brevity
    const systemMessage = {
      role: "system",
      content:
        "You are a concise assistant. Keep your responses brief and to the point, ideally under 100 words.",
    };

    // Create a chat completion
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      stream: true,
      messages: [systemMessage, ...messages],
      max_tokens: 150, // Limit response length
      temperature: 0.7, // Slightly reduce randomness
    });

    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response);

    // Return a StreamingTextResponse, which can be consumed by the client
    return new StreamingTextResponse(stream);
  } catch (error: unknown) {
    console.error("OpenAI API Error:", error);

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
