import { useCallback, useEffect, useMemo, useState } from "react";

export function useInfiniteMessages(loader) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await loader({});
      setMessages(result.messages);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [loader]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !nextCursor) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await loader({ before: nextCursor });
      setMessages(current => [...result.messages, ...current]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading, loader, nextCursor]);

  useEffect(() => {
    loadInitial().catch(() => undefined);
  }, [loadInitial]);

  return useMemo(
    () => ({
      messages,
      setMessages,
      hasMore,
      isLoading,
      loadInitial,
      loadMore,
    }),
    [hasMore, isLoading, loadInitial, loadMore, messages],
  );
}
