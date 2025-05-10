"use client";

import { useChat } from "ai/react";
import Scene from "./Scene";
import OverlayCube from "./OverlayCube";
import { useEffect, useState, useCallback, useRef } from "react";

// Define the possible states of our sequence
type SequenceState =
  | "idle" // Initial state, ready for input
  | "loading" // Camera moving and/or LLM streaming, cube visible
  | "text_rendering" // Text is being rendered, cube fading out
  | "complete"; // Text is rendered, camera drift active

export default function SceneWrapper() {
  const [sequenceState, setSequenceState] = useState<SequenceState>("idle");
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [lastCompleteContent, setLastCompleteContent] = useState<string | null>(
    null
  );
  const [pendingContent, setPendingContent] = useState<string | null>(null);

  // Add timing refs
  const llmStartTimeRef = useRef<number | null>(null);
  const lastStateChangeTimeRef = useRef<number>(Date.now());
  const cameraMovementCompleteRef = useRef(false);
  const llmCompleteRef = useRef(false);

  const { messages, ...restChatProps } = useChat({
    onFinish: (message) => {
      const now = Date.now();
      console.log("[SceneWrapper] LLM Stream Finished:", {
        messageId: message.id,
        contentLength: message.content.length,
        role: message.role,
        currentState: sequenceState,
        cameraMovementComplete: cameraMovementCompleteRef.current,
        timestamp: new Date().toISOString(),
      });

      // Store the content but don't render yet
      setPendingContent(message.content);
      llmCompleteRef.current = true;

      // If camera movement is already complete, start text rendering
      if (cameraMovementCompleteRef.current) {
        console.log(
          "[SceneWrapper] Camera movement already complete, starting text render"
        );
        setLastCompleteContent(message.content);
        setSequenceState("text_rendering");
        lastStateChangeTimeRef.current = now;
      } else {
        console.log("[SceneWrapper] Waiting for camera movement to complete");
      }
    },
    onResponse: (response) => {
      const now = Date.now();
      llmStartTimeRef.current = now;
      llmCompleteRef.current = false;
      cameraMovementCompleteRef.current = false;

      console.log("[SceneWrapper] LLM Stream Started:", {
        status: response.status,
        headers: response.headers,
        currentState: sequenceState,
        timestamp: new Date().toISOString(),
      });

      // Reset states when new response starts
      setSequenceState("loading");
      setLastCompleteContent(null);
      setPendingContent(null);
      lastStateChangeTimeRef.current = now;
    },
    onError: (error) => {
      console.error("[SceneWrapper] LLM Error:", {
        error,
        currentState: sequenceState,
        timestamp: new Date().toISOString(),
      });

      // Reset to idle state on error
      setSequenceState("idle");
      setLastCompleteContent(null);
      setPendingContent(null);
      llmCompleteRef.current = false;
      cameraMovementCompleteRef.current = false;
      lastStateChangeTimeRef.current = Date.now();
    },
  });

  // Track message changes
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.id !== lastMessageId) {
        const now = Date.now();
        console.log("[SceneWrapper] New Message Detected:", {
          oldId: lastMessageId,
          newId: lastMessage.id,
          role: lastMessage.role,
          contentLength: lastMessage.content.length,
          currentState: sequenceState,
          timeSinceLastStateChange: `${now - lastStateChangeTimeRef.current}ms`,
          timestamp: new Date().toISOString(),
        });
        setLastMessageId(lastMessage.id);
      }
    }
  }, [messages, lastMessageId, sequenceState]);

  // Handle camera movement completion
  useEffect(() => {
    const handleCameraMovementComplete = () => {
      const now = Date.now();
      console.log("[SceneWrapper] Camera Movement Complete:", {
        currentState: sequenceState,
        hasPendingContent: !!pendingContent,
        llmComplete: llmCompleteRef.current,
        timestamp: new Date().toISOString(),
      });

      cameraMovementCompleteRef.current = true;

      // If we have pending content, start text rendering
      if (pendingContent) {
        console.log("[SceneWrapper] Starting text render with pending content");
        setLastCompleteContent(pendingContent);
        setSequenceState("text_rendering");
        lastStateChangeTimeRef.current = now;
      } else {
        console.log("[SceneWrapper] Waiting for LLM to complete");
      }
    };

    window.addEventListener(
      "cameraMovementComplete",
      handleCameraMovementComplete
    );
    return () => {
      window.removeEventListener(
        "cameraMovementComplete",
        handleCameraMovementComplete
      );
    };
  }, [sequenceState, pendingContent]);

  // Handle text render completion
  useEffect(() => {
    const handleTextRenderComplete = () => {
      const now = Date.now();
      console.log("[SceneWrapper] Text Render Complete:", {
        currentState: sequenceState,
        timestamp: new Date().toISOString(),
      });

      if (sequenceState === "text_rendering") {
        console.log("[SceneWrapper] Transitioning to complete state");
        setSequenceState("complete");
        lastStateChangeTimeRef.current = now;
      }
    };

    window.addEventListener("textRenderComplete", handleTextRenderComplete);
    return () => {
      window.removeEventListener(
        "textRenderComplete",
        handleTextRenderComplete
      );
    };
  }, [sequenceState]);

  // Handle chat submission
  const handleSubmit = restChatProps.handleSubmit;
  const wrappedHandleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      const now = Date.now();
      console.log("[SceneWrapper] Form Submitted:", {
        currentState: sequenceState,
        timestamp: new Date().toISOString(),
      });
      try {
        setSequenceState("loading");
        lastStateChangeTimeRef.current = now;
        await handleSubmit(e);
      } catch (error) {
        console.error("[SceneWrapper] Submit Error:", {
          error,
          currentState: sequenceState,
          timestamp: new Date().toISOString(),
        });
        setSequenceState("idle");
        lastStateChangeTimeRef.current = Date.now();
      }
    },
    [handleSubmit, sequenceState]
  );

  const chatProps = {
    ...restChatProps,
    messages,
    isLoading: sequenceState !== "idle" && sequenceState !== "complete",
    handleSubmit: wrappedHandleSubmit,
  };

  return (
    <>
      <Scene chatProps={chatProps} />
      <OverlayCube
        messages={messages}
        sequenceState={sequenceState}
        lastCompleteContent={lastCompleteContent}
      />
    </>
  );
}
