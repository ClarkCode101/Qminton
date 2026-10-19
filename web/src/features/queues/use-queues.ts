import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createQueue, deleteQueue, getQueue, listQueues, type NewQueueInput } from "@/services/queues";

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
