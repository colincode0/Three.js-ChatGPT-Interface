// Limits shared by the chat input (client) and /api/chat (server)

// Longest message a user can send
export const MAX_USER_MESSAGE_CHARS = 1000;

// Assistant replies come back from the client as history, so they get a
// separate, looser cap (MAX_REPLY_TOKENS is roughly 4 chars per token)
export const MAX_ASSISTANT_MESSAGE_CHARS = 4000;

// How many recent messages are forwarded to OpenAI as context
export const MAX_HISTORY_MESSAGES = 10;

// Cap on reply length, which also caps the cost of each request
export const MAX_REPLY_TOKENS = 500;

// Reject request bodies above this size before parsing them
export const MAX_BODY_BYTES = 256 * 1024;
