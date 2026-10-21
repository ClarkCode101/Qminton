import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queueKeys } from "@/features/queues/use-queues";
import { useToast } from "@/hooks/use-toast";
import { toUserMessage } from "@/services/errors";
import type { SkillLevel } from "@/services/players";
import { addSignups, listSignups, removeSignup, setQueuePlan, startSession } from "@/services/signups";

// Under ["queues", id], so a sign-up from a phone (which bumps the queue
// version) refreshes the organizer's list live.
export const signupKeys = {
  list: (queueId: string) => ["queues", queueId, "signups"] as const,
};

function reloadQueue(queryClient: ReturnType<typeof useQueryClient>, queueId: string) {
  void queryClient.invalidateQueries({ queryKey: queueKeys.detail(queueId) });
  void queryClient.invalidateQueries({ queryKey: queueKeys.list, exact: true });
}

export function useSignups(queueId: string, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: signupKeys.list(queueId), queryFn: () => listSignups(queueId), enabled: options.enabled });
}

export function useAddSignups(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (people: { name: string; skill: SkillLevel }[]) => addSignups(queueId, people),
    onSuccess: ({ added, skipped }) => {
      const message = `Added ${added} to the list`;
      showToast(skipped > 0 ? `${message} (${skipped} already on it)` : message, "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error) => showToast(toUserMessage(error, "Failed to add to the list"), "error"),
  });
}

export function useRemoveSignup(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (signup: { id: number; name: string }) => removeSignup(queueId, signup.id),
    onSuccess: (_, signup) => {
      showToast(`${signup.name} removed from the list`, "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error) => {
      showToast(toUserMessage(error, "Failed to remove"), "error");
      reloadQueue(queryClient, queueId);
    },
  });
}

export function useChangePlanDate(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (startsAt: string) => setQueuePlan(queueId, startsAt),
    onSuccess: (queue) => {
      queryClient.setQueryData(queueKeys.detail(queueId), queue);
      showToast("Date and time saved", "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error) => showToast(toUserMessage(error, "Failed to save the date"), "error"),
  });
}

// "Start session": those who came become players (billed now); the queue goes live.
export function useStartSession(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (arrivedIds: number[]) => startSession(queueId, arrivedIds),
    onSuccess: ({ added, noShow }) => {
      const players = `${added} player${added === 1 ? "" : "s"} added`;
      showToast(`Session started: ${players}${noShow > 0 ? `, ${noShow} didn't come` : ""}`, "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error) => {
      showToast(toUserMessage(error, "Failed to start the session"), "error");
      reloadQueue(queryClient, queueId);
    },
  });
}
