import { useEffect, useState } from 'react';

export function useAsync<T>(load: () => Promise<T>, key: string): {
  data: T | null;
  error: string | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    load()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
    // load is a stable loader from ../loader, key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, error };
}
