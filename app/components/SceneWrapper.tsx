"use client";

import { useChat } from "ai/react";
import Scene from "./Scene";
import OverlayCube from "./OverlayCube";
import { useState } from "react";

export default function SceneWrapper() {
  const [shouldFadeOut, setShouldFadeOut] = useState(false);
  const { messages, isLoading: isChatLoading, ...restChatProps } = useChat();

  // Handle chat events using the returned methods
  const handleSubmit = restChatProps.handleSubmit;
  const wrappedHandleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    setShouldFadeOut(true);
    await handleSubmit(e);
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
      <OverlayCube
        messages={messages}
        isChatLoading={isChatLoading}
        shouldFadeOut={shouldFadeOut}
      />
    </>
  );
}
