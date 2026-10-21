import type { SkillLevel } from "@/services/players";
import type { GameMode, Queue, QueueStatus } from "@/services/queues";
import { supabase } from "@/services/supabase";
import type { Tables } from "@/types/database";

// Planned sessions with sign-up (owner's addition, 2026-10-21). The shared link
// is the same code (token) as QR check-in: while the queue is "planned" people
// sign up; once it is "live" the same link checks people in.

export type Signup = Tables<"signups">;

// A sign-up made from this phone: the secret code lets it cancel later.
export interface MySignup {
  code: string;
  name: string;
}

// What the shared link shows. null = unknown or replaced link.
export interface SignupPage {
  queueId: string;
  queueName: string;
  gameMode: GameMode;
  status: QueueStatus;
  startsAt: string | null;
  courtFee: number;
  gameRate: number;
  // Sign-ups open (planned) / check-in open (live).
  isOpen: boolean;
  // Names of everyone still going, in sign-up order (planned only).
  going: string[];
  // Which of this phone's codes are still on the list.
  mine: MySignup[];
}

export interface SignUpResult {
  name: string;
  // Their place on the list, 1-based.
  position: number;
  code: string;
}

// Public (no login).
export async function getSignupPage(token: string, myCodes: string[] = []): Promise<SignupPage | null> {
  const { data, error } = await supabase.rpc("get_signup", { p_token: token, p_my_codes: myCodes });
  // 22P02 = not a valid code at all: same as "unknown".
  if (error?.code === "22P02") return null;
  if (error) throw error;
  if (!data) return null;
  const raw = data as unknown as {
    queue_id: string;
    queue_name: string;
    game_mode: GameMode;
    status: QueueStatus;
    starts_at: string | null;
    court_fee: number;
    game_rate: number;
    is_open: boolean;
    going: string[];
    mine: MySignup[];
  };
  return {
    queueId: raw.queue_id,
    queueName: raw.queue_name,
    gameMode: raw.game_mode,
    status: raw.status,
    startsAt: raw.starts_at,
    courtFee: raw.court_fee,
    gameRate: raw.game_rate,
    isOpen: raw.is_open,
    going: raw.going,
    mine: raw.mine,
  };
}

// Public (no login): put yourself on the list of a planned session.
export async function signUp(token: string, person: { name: string; skill: SkillLevel }): Promise<SignUpResult> {
  const { data, error } = await supabase.rpc("sign_up", { p_token: token, p_name: person.name, p_skill: person.skill });
  if (error) throw error;
  return data as unknown as SignUpResult;
}

// Public (no login): cancel your own spot with the code your phone kept.
export async function cancelSignup(token: string, code: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_signup", { p_token: token, p_code: code });
  if (error) throw error;
}

// Organizer: everyone still going, in sign-up order.
export async function listSignups(queueId: string): Promise<Signup[]> {
  const { data, error } = await supabase
    .from("signups")
    .select("*")
    .eq("queue_id", queueId)
    .eq("status", "going")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data;
}

// Organizer: put people on the list themselves (e.g. they messaged instead of
// using the link). Names already going are skipped. Only the organizer can
// remove these spots (nobody holds their cancel code).
export async function addSignups(queueId: string, people: { name: string; skill: SkillLevel }[]): Promise<{ added: number; skipped: number }> {
  const { data, error } = await supabase.rpc("add_signups", { p_queue_id: queueId, p_people: people });
  if (error) throw error;
  return data as unknown as { added: number; skipped: number };
}

export async function removeSignup(queueId: string, signupId: number): Promise<void> {
  const { error } = await supabase.rpc("remove_signup", { p_queue_id: queueId, p_signup_id: signupId });
  if (error) throw error;
}

// Organizer: make a fresh queue "planned" (sign-ups open), or change its date.
export async function setQueuePlan(queueId: string, startsAt: string): Promise<Queue> {
  const { data, error } = await supabase.rpc("set_queue_plan", { p_queue_id: queueId, p_starts_at: startsAt });
  if (error) throw error;
  return data;
}

// Organizer: those who came become players (billed now); the queue goes live.
export async function startSession(queueId: string, arrivedIds: number[]): Promise<{ added: number; noShow: number }> {
  const { data, error } = await supabase.rpc("start_session", { p_queue_id: queueId, p_arrived: arrivedIds });
  if (error) throw error;
  const raw = data as { added: number; no_show: number };
  return { added: raw.added, noShow: raw.no_show };
}
