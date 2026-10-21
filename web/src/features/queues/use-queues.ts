import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createQueue,
  deleteQueue,
  getQueue,
  listQueues,
  renameQueue,
  updateQueueSettings,
  type NewQueueInput,
  type QueueSettingsUpdate,
} from "@/services/queues";

// TanStack Query keys: every screen that shows queues shares the same cache,
// so creating or deleting a queue updates the landing page, navbar and home.
export const queueKeys = {
  list: ["queues"] as const,
  detail: (queueId: string) => ["queues", queueId] as const,
};

export function useQueueSummaries({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queueKeys.list, queryFn: listQueues, enabled });
}

export function useQueue(queueId: string) {
  return useQuery({ queryKey: queueKeys.detail(queueId), queryFn: () => getQueue(queueId) });
}

export function useCreateQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewQueueInput) => createQueue(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queueKeys.list }),
  });
}

// Court count / billing setup changes. The saved settings show at once; this
// queue and everything under its key (players, matches, billing) and the
// landing page list reload in the background.
export function useUpdateQueueSettings(queueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: QueueSettingsUpdate) => updateQueueSettings(queueId, settings),
    onSuccess: (queue) => {
      if (queue) queryClient.setQueryData(queueKeys.detail(queueId), queue);
      void queryClient.invalidateQueries({ queryKey: queueKeys.detail(queueId) });
      void queryClient.invalidateQueries({ queryKey: queueKeys.list, exact: true });
    },
  });
}

// Rename any of the organizer's queues (from the landing card, the Queues
// popup, the Courts tab or a planned session).
export function useRenameQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ queueId, name }: { queueId: string; name: string }) => renameQueue(queueId, name),
    onSuccess: (queue, { queueId }) => {
      if (queue) queryClient.setQueryData(queueKeys.detail(queueId), queue);
      void queryClient.invalidateQueries({ queryKey: queueKeys.list, exact: true });
    },
  });
}

export function useDeleteQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (queueId: string) => deleteQueue(queueId),
    onSuccess: (_result, queueId) => {
      queryClient.removeQueries({ queryKey: queueKeys.detail(queueId) });
      return queryClient.invalidateQueries({ queryKey: queueKeys.list });
    },
  });
}
