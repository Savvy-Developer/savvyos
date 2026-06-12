import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";


type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const simulateAsMutation = trpc.auth.simulateAs.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const stopSimulationMutation = trpc.auth.stopSimulation.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const workAsAgentMutation = trpc.agentSupport.workAsAgent.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const stopWorkingAsAgentMutation = trpc.agentSupport.stopWorkingAsAgent.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const userData = meQuery.data ?? null;
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(userData)
    );
    return {
      user: userData,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(userData),
      isSimulating: (userData as any)?.isSimulating ?? false,
      isWorkingAsAgent: (userData as any)?.isWorkingAsAgent ?? false,
      realUser: (userData as any)?.realUser ?? null,
      canSimulate: (userData as any)?.role === "admin" || (userData as any)?.realUser?.role === "admin",
      canWorkAsAgent: (userData as any)?.role === "agent_support" || (userData as any)?.realUser?.role === "agent_support",
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (import.meta.env.DEV) return; // dev mode: never redirect to OAuth
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    simulateAs: (userId: number) => simulateAsMutation.mutateAsync({ userId }),
    stopSimulation: () => stopSimulationMutation.mutateAsync(),
    isSimulatingLoading: simulateAsMutation.isPending || stopSimulationMutation.isPending,
    workAsAgent: (agentId: number) => workAsAgentMutation.mutateAsync({ agentId }),
    stopWorkingAsAgent: () => stopWorkingAsAgentMutation.mutateAsync(),
    isWorkingAsAgentLoading: workAsAgentMutation.isPending || stopWorkingAsAgentMutation.isPending,
  };
}
