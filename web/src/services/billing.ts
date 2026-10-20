import { supabase } from "@/services/supabase";
import type { Enums, Tables } from "@/types/database";

export type LedgerEntry = Tables<"ledger_entries">;
export type PaymentMethod = Enums<"payment_method">;

export interface PaymentDetails {
  paymentMethod: PaymentMethod;
  paymentReference?: string;
}

// Every billing record of the queue, newest first (higher id = added later).
export async function listLedger(queueId: string): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("queue_id", queueId)
    .order("id", { ascending: false });
  if (error) throw error;
  return data;
}

// Billing roster: every player of the queue, including removed ones, so an
// unpaid balance never disappears (old bug #2).
export async function listBillingPlayers(queueId: string): Promise<Tables<"players">[]> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("queue_id", queueId)
    .order("queue_position", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data;
}

// No amount = "Mark paid" (the whole balance). With an amount = partial payment.
export async function recordPayment(
  queueId: string,
  input: PaymentDetails & { playerId: number; amount?: number; note?: string },
): Promise<void> {
  const { error } = await supabase.rpc("record_payment", {
    p_queue_id: queueId,
    p_player_id: input.playerId,
    p_amount: input.amount,
    p_note: input.note,
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.paymentReference,
  });
  if (error) throw error;
}

export async function recordBulkPayment(queueId: string, input: PaymentDetails & { playerIds: number[] }): Promise<void> {
  const { error } = await supabase.rpc("record_bulk_payment", {
    p_queue_id: queueId,
    p_player_ids: input.playerIds,
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.paymentReference,
  });
  if (error) throw error;
}

// "Undo": reverses the player's latest payment that wasn't undone yet.
export async function reverseLatestPayment(queueId: string, playerId: number): Promise<void> {
  const { error } = await supabase.rpc("reverse_latest_payment", { p_queue_id: queueId, p_player_id: playerId });
  if (error) throw error;
}

export async function addAdjustment(queueId: string, input: { playerId: number; amount: number; note: string }): Promise<void> {
  const { error } = await supabase.rpc("add_adjustment", {
    p_queue_id: queueId,
    p_player_id: input.playerId,
    p_amount: input.amount,
    p_note: input.note,
  });
  if (error) throw error;
}

export async function addSharedFee(
  queueId: string,
  input: { playerIds: number[]; totalAmount: number; note: string },
): Promise<void> {
  const { error } = await supabase.rpc("add_shared_fee", {
    p_queue_id: queueId,
    p_player_ids: input.playerIds,
    p_total_amount: input.totalAmount,
    p_note: input.note,
  });
  if (error) throw error;
}
