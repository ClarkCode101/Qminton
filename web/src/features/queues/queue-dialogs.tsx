import { useNavigate } from "react-router";

import { ConfirmActionModal } from "@/components/confirm-action-modal";
import { NewQueueModal } from "@/features/queues/new-queue-modal";
import type { NewQueueFormOutput } from "@/features/queues/queue-form-schema";
import { useCreateQueue, useDeleteQueue } from "@/features/queues/use-queues";
import { useToast } from "@/hooks/use-toast";
import { getQueuePath } from "@/lib/routes";
import { toUserMessage } from "@/services/errors";

// The full "create a queue" flow used by Home, Landing and the navbar:
// save it, then open the new queue. Errors show a toast (old bug #7: they
// used to be unhandled) and keep the form open.
export function CreateQueueDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createQueue = useCreateQueue();

  const handleCreate = async (data: NewQueueFormOutput) => {
    try {
      const queueId = await createQueue.mutateAsync(data);
      onClose();
      navigate(getQueuePath(queueId));
    } catch (error) {
      showToast(toUserMessage(error, "Could not create the queue. Please try again."), "error");
      throw error;
    }
  };

  return <NewQueueModal onCreate={handleCreate} onClose={onClose} />;
}

interface DeleteQueueDialogProps {
  queue: { id: string; name: string };
  onClose: () => void;
  // Runs after a successful delete (e.g. leave the page of the deleted queue).
  onDeleted?: () => void;
}

// "Delete queue?" confirmation, same wording as the old app.
export function DeleteQueueDialog({ queue, onClose, onDeleted }: DeleteQueueDialogProps) {
  const { showToast } = useToast();
  const deleteQueue = useDeleteQueue();

  const handleConfirm = async () => {
    try {
      await deleteQueue.mutateAsync(queue.id);
      onClose();
      onDeleted?.();
    } catch (error) {
      showToast(toUserMessage(error, "Could not delete the queue. Please try again."), "error");
    }
  };

  return (
    <ConfirmActionModal
      title="Delete queue?"
      message={`Delete "${queue.name}"? This cannot be undone.`}
      confirmLabel="Delete Queue"
      tone="danger"
      busy={deleteQueue.isPending}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}
