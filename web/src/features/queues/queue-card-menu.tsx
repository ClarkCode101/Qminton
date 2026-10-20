import { MoreMenu } from "@/components/more-menu";

// The "⋯" button on a queue card. Delete lives in here instead of next to the
// main click target, so it can't be hit by accident.
export function QueueCardMenu({ queueName, onDelete }: { queueName: string; onDelete: () => void }) {
  return (
    // z-10 keeps the menu above the card's full-size link.
    <MoreMenu
      label={`More actions for ${queueName}`}
      className="relative z-10"
      items={[{ label: "Delete queue", tone: "danger", onSelect: onDelete }]}
    />
  );
}
