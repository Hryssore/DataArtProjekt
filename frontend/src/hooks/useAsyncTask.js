import { useCallback, useState } from "react";

export function useAsyncTask(initialState = null) {
  const [data, setData] = useState(initialState);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const run = useCallback(async callback => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await callback();
      setData(result);
      return result;
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    data,
    error,
    isLoading,
    setData,
    run,
  };
}
