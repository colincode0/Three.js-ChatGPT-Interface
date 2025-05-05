"use client";

import { useChat } from "ai/react";
import Scene from "./Scene";
import OverlayCube from "./OverlayCube";
import { useEffect } from "react";

export default function SceneWrapper() {
  const { messages, isLoading: isChatLoading, ...restChatProps } = useChat();

  // Add logging for loading state changes
  useEffect(() => {
    console.log("Chat loading state changed:", isChatLoading);
  }, [isChatLoading]);

  // Handle chat events using the returned methods
  const handleSubmit = restChatProps.handleSubmit;
  const wrappedHandleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    console.log("Form submitted, starting chat");
    await handleSubmit(e);
    console.log("Chat submission complete");
  };

  const chatProps = {
    ...restChatProps,
    messages,
    isLoading: isChatLoading,
    handleSubmit: wrappedHandleSubmit,
  };

  return (
    <>
      <Scene chatProps={chatProps} />
      <OverlayCube messages={messages} isChatLoading={isChatLoading} />
    </>
  );
}
