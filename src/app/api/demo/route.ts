import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const code6 = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const mins = (n: number) => new Date(Date.now() + n * 60 * 1000).toISOString();

// Spins up a fresh, fully-populated room so somebody arriving alone can play
// immediately instead of staring at an empty lobby.
export async function POST() {
  try {
    const s = supabaseAdmin();

    const { data: room, error: roomErr } = await s
      .from("rooms")
      .insert({ code: code6(), name: "Friday Night Chaos", vibe: "friendly chaos" })
      .select()
      .single();
    if (roomErr || !room) throw roomErr || new Error("room");

    const { data: bots, error: botErr } = await s
      .from("players")
      .insert([
        { room_id: room.id, nickname: "Marcus", avatar: "🦝", points: 1510 },
        { room_id: room.id, nickname: "Sam", avatar: "🐼", points: 1240 },
        { room_id: room.id, nickname: "Priya", avatar: "🐸", points: 860 }
      ])
      .select();
    if (botErr || !bots) throw botErr || new Error("bots");

    const by = (n: string) => bots.find(b => b.nickname === n)!;
    const marcus = by("Marcus"), sam = by("Sam"), priya = by("Priya");

    const { data: me, error: meErr } = await s
      .from("players")
      .insert({ room_id: room.id, nickname: "You", avatar: "🦊", points: 750 })
      .select()
      .single();
    if (meErr || !me) throw meErr || new Error("player");

    const { data: preds, error: predErr } = await s
      .from("predictions")
      .insert([
        {
          room_id: room.id, author_id: priya.id, subject_id: sam.id,
          question: "Will Sam reply in the group chat before this timer runs out?",
          deadline: mins(4), status: "open"
        },
        {
          room_id: room.id, author_id: sam.id, subject_id: priya.id,
          question: "Will Priya say she's five minutes away while still at home?",
          deadline: mins(60 * 8), status: "open"
        },
        {
          room_id: room.id, author_id: sam.id, subject_id: marcus.id,
          question: "Did Marcus actually make it to the gym this morning?",
          deadline: mins(-12), status: "voting"
        },
        {
          room_id: room.id, author_id: marcus.id, subject_id: sam.id,
          question: "Did Sam send a dramatic voice note about the group trip?",
          deadline: mins(-60 * 20), status: "resolved", outcome: true
        }
      ])
      .select();
    if (predErr || !preds) throw predErr || new Error("predictions");

    const p = (frag: string) => preds.find(x => x.question.includes(frag))!;
    const timer = p("timer"), away = p("five minutes"), gym = p("gym");

    await s.from("bets").insert([
      { prediction_id: timer.id, player_id: priya.id, choice: true, amount: 220 },
      { prediction_id: timer.id, player_id: marcus.id, choice: false, amount: 140 },
      { prediction_id: away.id, player_id: sam.id, choice: true, amount: 300 },
      { prediction_id: away.id, player_id: marcus.id, choice: false, amount: 180 },
      { prediction_id: gym.id, player_id: sam.id, choice: true, amount: 200 },
      { prediction_id: gym.id, player_id: priya.id, choice: false, amount: 260 },
      // You arrive with a stake already riding on the vote that's about to be settled.
      { prediction_id: gym.id, player_id: me.id, choice: true, amount: 250 }
    ]);

    // One vote already in, so a single vote from the newcomer reaches quorum.
    await s.from("votes").insert([
      { prediction_id: gym.id, player_id: sam.id, outcome: true }
    ]);

    await s.from("activity").insert([
      { room_id: room.id, player_id: marcus.id, message: "🦝 Marcus joined the room" },
      { room_id: room.id, player_id: sam.id, message: "🐼 Sam joined the room" },
      { room_id: room.id, player_id: priya.id, message: "🐸 Priya joined the room" },
      { room_id: room.id, player_id: marcus.id, message: "✅ YES — “Did Sam send a dramatic voice note about the group trip?” resolved. Winners: Priya" },
      { room_id: room.id, player_id: sam.id, message: "🐼 Sam posted: “Did Marcus actually make it to the gym this morning?”" },
      { room_id: room.id, player_id: priya.id, message: "🐸 Priya put 220 points on YES" },
      { room_id: room.id, player_id: marcus.id, message: "🦝 Marcus put 140 points on NO" },
      { room_id: room.id, player_id: me.id, message: "🦊 You put 250 points on YES" }
    ]);

    return NextResponse.json({ room, player: me });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start a demo room.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
