import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { LogEntry, User } from "./types";

interface AppState {
  users: User[];
  currentUser: User | null;
  refreshUsers: () => Promise<void>;
  reloadCurrentUser: () => Promise<void>;
  login: (userId: string) => void;
  logout: () => void;
  loadingUsers: boolean;
  log: LogEntry[];
  appendLog: (entry: LogEntry) => void;
  clearLog: () => void;
  txVersion: number;
  bumpTxVersion: () => void;
}

const AppContext = createContext<AppState | null>(null);
const MAX_LOG_ENTRIES = 200;
const CALLER_STORAGE_KEY = "belo:callerUserId";

export function AppProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [callerUserId, setCallerUserId] = useState<string>(
    () => localStorage.getItem(CALLER_STORAGE_KEY) ?? "",
  );
  const [txVersion, setTxVersion] = useState(0);

  const bumpTxVersion = useCallback(() => {
    setTxVersion((v) => v + 1);
  }, []);

  const appendLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const clearLog = useCallback(() => setLog([]), []);

  const login = useCallback((id: string) => {
    setCallerUserId(id);
    if (id) localStorage.setItem(CALLER_STORAGE_KEY, id);
    else localStorage.removeItem(CALLER_STORAGE_KEY);
  }, []);

  const logout = useCallback(() => {
    setCallerUserId("");
    localStorage.removeItem(CALLER_STORAGE_KEY);
  }, []);

  const refreshUsers = useCallback(async () => {
    setLoadingUsers(true);
    const res = await api.listUsers({ limit: 100 }, appendLog);
    if (res.ok && res.body && typeof res.body === "object" && "data" in res.body) {
      const body = res.body as { data: User[] };
      setUsers(body.data);
    }
    setLoadingUsers(false);
  }, [appendLog]);

  const reloadCurrentUser = useCallback(async () => {
    if (!callerUserId) return;
    const res = await api.getUser(callerUserId, appendLog);
    if (res.ok && res.body && typeof res.body === "object" && "id" in res.body) {
      const user = res.body as User;
      setUsers((prev) => {
        const without = prev.filter((u) => u.id !== user.id);
        return [...without, user].sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : -1,
        );
      });
    } else if (res.status === 404) {
      logout();
    }
  }, [callerUserId, appendLog, logout]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === callerUserId) ?? null,
    [users, callerUserId],
  );

  const state = useMemo<AppState>(
    () => ({
      users,
      currentUser,
      refreshUsers,
      reloadCurrentUser,
      login,
      logout,
      loadingUsers,
      log,
      appendLog,
      clearLog,
      txVersion,
      bumpTxVersion,
    }),
    [
      users,
      currentUser,
      refreshUsers,
      reloadCurrentUser,
      login,
      logout,
      loadingUsers,
      log,
      appendLog,
      clearLog,
      txVersion,
      bumpTxVersion,
    ],
  );

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
