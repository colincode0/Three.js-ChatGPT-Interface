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

    // Create a chat completion
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      stream: true,
      messages: messages,
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
