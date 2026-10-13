import { useCallback, useEffect, useRef, useState } from "react";
import { isNetworkError, readSnapshot, writeSnapshot } from "../services/offlineSnapshotCache";

export default function useOfflineSnapshot({ projectId, type, loader }) {
  const [state, setState] = useState({ loading: true, data: null, error: null, isFromCache: false, cachedAt: null, cacheMiss: false, isOnline: navigator.onLine !== false });
  const requestRef = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null, cacheMiss: false, isOnline: navigator.onLine !== false }));
    try {
      const data = await loaderRef.current();
      await writeSnapshot(projectId, type, data);
      if (requestId === requestRef.current) setState({ loading: false, data, error: null, isFromCache: false, cachedAt: null, cacheMiss: false, isOnline: true });
      return data;
    } catch (error) {
      if (!isNetworkError(error)) {
        if (requestId === requestRef.current) setState({ loading: false, data: null, error, isFromCache: false, cachedAt: null, cacheMiss: false, isOnline: navigator.onLine !== false });
        return null;
      }
      try {
        const snapshot = await readSnapshot(projectId, type);
        if (requestId !== requestRef.current) return null;
        if (snapshot?.payload !== undefined) {
          setState({ loading: false, data: snapshot.payload, error: null, isFromCache: true, cachedAt: snapshot.cachedAt, cacheMiss: false, isOnline: false });
        } else {
          setState({ loading: false, data: null, error: null, isFromCache: false, cachedAt: null, cacheMiss: true, isOnline: false });
        }
      } catch (cacheError) {
        if (requestId === requestRef.current) setState({ loading: false, data: null, error: cacheError, isFromCache: false, cachedAt: null, cacheMiss: true, isOnline: false });
      }
      return null;
    }
  }, [projectId, type]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const update = () => setState((prev) => ({ ...prev, isOnline: navigator.onLine !== false }));
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  return { ...state, reload: load, isReadOnly: state.isFromCache || !state.isOnline };
}
