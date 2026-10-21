import { MoreMenu } from "@/components/more-menu";

// The "⋯" button on a queue card. Edit and Delete live in here instead of next
// to the main click target, so Delete can't be hit by accident. A planned
// session edits its name, date and time; a live queue just its name.
export function QueueCardMenu({
  queueName,
  isPlanned,
  onEdit,
  onDelete,
}: {
  queueName: string;
  isPlanned: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    // z-10 keeps the menu above the card's full-size link.
    <MoreMenu
      label={`More actions for ${queueName}`}
      className="relative z-10"
      items={[
        { label: isPlanned ? "Edit name, date & time" : "Rename queue", onSelect: onEdit },
        { label: "Delete queue", tone: "danger", onSelect: onDelete },
      ]}
    />
  );
}
