import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sendChatMessageStream, getChatHistory } from "../lib/api";
import type { ChatImageAttachment, ChatMessage, ChatMood } from "../types";

/* ── Public context shape ───────────────────────────────────────────── */

export interface ChatContextValue {
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  historyLoaded: boolean;

  setError: (error: string | null) => void;
  dispatchMessage: (text: string, attachments?: ChatImageAttachment[]) => Promise<void>;
  loadOlderMessages: () => Promise<{ prevCount: number }>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}

/* ── Provider ───────────────────────────────────────────────────────── */

interface ChatProviderProps {
  children: ReactNode;
  onMoodChange: (mood: ChatMood) => void;
  onDataMutated?: (tools: string[]) => void;
}

export function ChatProvider({ children, onMoodChange, onDataMutated }: ChatProviderProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const nextPageRef = useRef(2);
  const streamContentRef = useRef("");
  const streamRafRef = useRef<number | null>(null);
  const streamPlaceholderIdRef = useRef<string | null>(null);

  // Keep callback refs stable so dispatchMessage doesn't need them as deps
  const onMoodChangeRef = useRef(onMoodChange);
  onMoodChangeRef.current = onMoodChange;
  const onDataMutatedRef = useRef(onDataMutated);
  onDataMutatedRef.current = onDataMutated;

  // Guard ref so dispatchMessage doesn't depend on isSending state
  const isSendingRef = useRef(false);

  /* ── Load chat history on mount ──────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async (): Promise<void> => {
      try {
        const response = await getChatHistory(1, 25);
        if (cancelled) return;
        const msgs = response.history.messages;
        setHasMore(response.history.hasMore);
        nextPageRef.current = 2;
        if (msgs.length > 0) {
          setMessages(msgs);
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
          if (lastAssistant?.metadata?.mood) {
            onMoodChangeRef.current(lastAssistant.metadata.mood);
          }
        }
        setHistoryLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError("Failed to load chat history");
        console.error(err);
        setHistoryLoaded(true);
      }
    };
    void loadHistory();
    return () => { cancelled = true; };
  }, []);

  /* ── Load older (paginated) messages ─────────────────────────────── */

  const loadOlderMessages = useCallback(async (): Promise<{ prevCount: number }> => {
    if (loadingMore || !hasMore) return { prevCount: 0 };
    setLoadingMore(true);
    const prevCount = messages.length;
    try {
      const response = await getChatHistory(nextPageRef.current, 50);
      const olderMessages = response.history.messages;
      if (olderMessages.length > 0) {
        setMessages((prev) => [...olderMessages, ...prev]);
        nextPageRef.current += 1;
      }
      setHasMore(response.history.hasMore);
    } catch (err) {
      console.error("Failed to load older messages", err);
    } finally {
      setLoadingMore(false);
    }
    return { prevCount };
  }, [loadingMore, hasMore, messages.length]);

  /* ── Send a message (streaming) ──────────────────────────────────── */

  const dispatchMessage = useCallback(async (
    messageText: string,
    attachmentsToSend: ChatImageAttachment[] = []
  ): Promise<void> => {
    const trimmedText = messageText.trim();
    if ((trimmedText.length === 0 && attachmentsToSend.length === 0) || isSendingRef.current) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedText,
      timestamp: new Date().toISOString(),
      ...(attachmentsToSend.length > 0
        ? { metadata: { attachments: attachmentsToSend } }
        : {})
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);
    isSendingRef.current = true;
    setError(null);

    const assistantPlaceholder: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      streaming: true
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    try {
      streamContentRef.current = "";
      streamPlaceholderIdRef.current = assistantPlaceholder.id;

      const response = await sendChatMessageStream(
        trimmedText,
        {
          onToken: (delta: string) => {
            if (delta.length === 0) return;
            streamContentRef.current += delta;
            if (streamRafRef.current === null) {
              streamRafRef.current = requestAnimationFrame(() => {
                streamRafRef.current = null;
                const content = streamContentRef.current;
                const placeholderId = streamPlaceholderIdRef.current;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === placeholderId
                      ? { ...msg, content, streaming: true }
                      : msg
                  )
                );
              });
            }
          }
        },
        attachmentsToSend
      );

      // Cancel any pending rAF before final commit
      if (streamRafRef.current !== null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }

      if (response.message.metadata?.mood) {
        onMoodChangeRef.current(response.message.metadata.mood);
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantPlaceholder.id ? { ...response.message, streaming: false } : msg
        )
      );

      if (response.executedTools?.length) {
        onDataMutatedRef.current?.(response.executedTools);
      } else {
        onDataMutatedRef.current?.([]);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : "Failed to send message. Please try again.";
      setError(errorMessage);
      console.error(err);
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantPlaceholder.id));
    } finally {
      setIsSending(false);
      isSendingRef.current = false;
      streamPlaceholderIdRef.current = null;
    }
  }, []);

  /* ── Cleanup ─────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (streamRafRef.current !== null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
    };
  }, []);

  /* ── Context value (memoised) ────────────────────────────────────── */

  const value = useMemo<ChatContextValue>(() => ({
    messages,
    isSending,
    error,
    hasMore,
    loadingMore,
    historyLoaded,
    setError,
    dispatchMessage,
    loadOlderMessages,
  }), [messages, isSending, error, hasMore, loadingMore, historyLoaded, dispatchMessage, loadOlderMessages]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
