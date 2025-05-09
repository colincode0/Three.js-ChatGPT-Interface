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

  // Add timing refs
  const llmStartTimeRef = useRef<number | null>(null);
  const cameraStartTimeRef = useRef<number | null>(null);
  const lastStateChangeTimeRef = useRef<number>(Date.now());
  const cameraMovementCompleteRef = useRef(false);
  const llmCompleteRef = useRef(false);

  const {
    messages,
    isLoading: isChatLoading,
    ...restChatProps
  } = useChat({
    onFinish: (message) => {
      const now = Date.now();
      const llmDuration = llmStartTimeRef.current
        ? now - llmStartTimeRef.current
        : null;
      const cameraDuration = cameraStartTimeRef.current
        ? now - cameraStartTimeRef.current
        : null;

      console.log("[SceneWrapper] LLM Stream Finished:", {
        messageId: message.id,
        contentLength: message.content.length,
        role: message.role,
        currentState: sequenceState,
        llmDuration: llmDuration ? `${llmDuration}ms` : "unknown",
        cameraDuration: cameraDuration ? `${cameraDuration}ms` : "unknown",
        timeSinceLastStateChange: `${now - lastStateChangeTimeRef.current}ms`,
        cameraMovementComplete: cameraMovementCompleteRef.current,
        timestamp: new Date().toISOString(),
      });

      setLastCompleteContent(message.content);
      llmCompleteRef.current = true;

      // If camera movement is already complete, start text rendering
      if (cameraMovementCompleteRef.current) {
        console.log(
          "[SceneWrapper] Camera movement already complete, starting text render"
        );
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
        timeSinceLastStateChange: `${now - lastStateChangeTimeRef.current}ms`,
        timestamp: new Date().toISOString(),
      });

      // Reset states when new response starts
      setSequenceState("loading");
      setLastCompleteContent(null);
      lastStateChangeTimeRef.current = now;
    },
    onError: (error) => {
      console.error("[SceneWrapper] LLM Error:", {
        error,
        currentState: sequenceState,
        timeSinceLastStateChange: `${
          Date.now() - lastStateChangeTimeRef.current
        }ms`,
        timestamp: new Date().toISOString(),
      });

      // Reset to idle state on error
      setSequenceState("idle");
      setLastCompleteContent(null);
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
      const cameraDuration = cameraStartTimeRef.current
        ? now - cameraStartTimeRef.current
        : null;
      const llmDuration = llmStartTimeRef.current
        ? now - llmStartTimeRef.current
        : null;

      console.log("[SceneWrapper] Camera Movement Complete:", {
        currentState: sequenceState,
        hasCompleteContent: !!lastCompleteContent,
        contentLength: lastCompleteContent?.length,
        cameraDuration: cameraDuration ? `${cameraDuration}ms` : "unknown",
        llmDuration: llmDuration ? `${llmDuration}ms` : "unknown",
        timeSinceLastStateChange: `${now - lastStateChangeTimeRef.current}ms`,
        llmComplete: llmCompleteRef.current,
        timestamp: new Date().toISOString(),
      });

      cameraMovementCompleteRef.current = true;

      // If LLM is already complete, start text rendering
      if (llmCompleteRef.current && lastCompleteContent) {
        console.log(
          "[SceneWrapper] LLM already complete, starting text render"
        );
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
  }, [sequenceState, lastCompleteContent]);

  // Handle text render completion
  useEffect(() => {
    const handleTextRenderComplete = () => {
      const now = Date.now();
      console.log("[SceneWrapper] Text Render Complete:", {
        currentState: sequenceState,
        hasCompleteContent: !!lastCompleteContent,
        contentLength: lastCompleteContent?.length,
        timeSinceLastStateChange: `${now - lastStateChangeTimeRef.current}ms`,
        timestamp: new Date().toISOString(),
      });

      // Only transition to complete if we're in text_rendering state
      if (sequenceState === "text_rendering") {
        console.log(
          "[SceneWrapper] Transitioning to complete state after text render"
        );
        setSequenceState("complete");
        lastStateChangeTimeRef.current = now;
      } else {
        console.warn(
          "[SceneWrapper] Received text render complete in unexpected state:",
          {
            currentState: sequenceState,
            timestamp: new Date().toISOString(),
          }
        );
      }
    };

    window.addEventListener("textRenderComplete", handleTextRenderComplete);
    return () => {
      window.removeEventListener(
        "textRenderComplete",
        handleTextRenderComplete
      );
    };
  }, [sequenceState, lastCompleteContent]);

  // Handle chat submission
  const handleSubmit = restChatProps.handleSubmit;
  const wrappedHandleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      const now = Date.now();
      console.log("[SceneWrapper] Form Submitted:", {
        currentState: sequenceState,
        timeSinceLastStateChange: `${now - lastStateChangeTimeRef.current}ms`,
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
          timeSinceLastStateChange: `${
            Date.now() - lastStateChangeTimeRef.current
          }ms`,
          timestamp: new Date().toISOString(),
        });
        setSequenceState("idle");
        lastStateChangeTimeRef.current = Date.now();
      }
    },
    [handleSubmit, sequenceState]
  );

  // Debug state changes
  useEffect(() => {
    const now = Date.now();
    console.log("[SceneWrapper] State Changed:", {
      newState: sequenceState,
      isChatLoading,
      hasCompleteContent: !!lastCompleteContent,
      contentLength: lastCompleteContent?.length,
      timeSinceLastStateChange: `${now - lastStateChangeTimeRef.current}ms`,
      llmComplete: llmCompleteRef.current,
      cameraMovementComplete: cameraMovementCompleteRef.current,
      timestamp: new Date().toISOString(),
    });
  }, [sequenceState, isChatLoading, lastCompleteContent]);

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
