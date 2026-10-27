import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Predictions left in voting this long with nobody around get settled automatically,
// so a room never freezes just because everyone closed the tab.
const STALE_MINUTES = 60;

type Bet = { id: string; prediction_id: string; player_id: string; choice: boolean; amount: number };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const s = supabaseAdmin();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_MINUTES * 60 * 1000).toISOString();

    // 1. Betting closes on anything past its deadline.
    const { data: closed } = await s
      .from("predictions")
      .update({ status: "voting" })
      .eq("status", "open")
      .lte("deadline", now.toISOString())
      .select("id");

    // 2. Settle anything that has been sitting in voting too long.
    const { data: stale } = await s
      .from("predictions")
      .select("*")
      .eq("status", "voting")
      .lte("deadline", staleBefore);

    let settled = 0;

    for (const p of stale ?? []) {
      const [{ data: votes }, { data: bets }, { data: players }] = await Promise.all([
        s.from("votes").select("*").eq("prediction_id", p.id),
        s.from("bets").select("*").eq("prediction_id", p.id),
        s.from("players").select("id,points,nickname").eq("room_id", p.room_id)
      ]);

      const pool = (bets ?? []) as Bet[];
      const balance = new Map((players ?? []).map(x => [x.id, x.points as number]));
      const credit = async (playerId: string, amount: number) => {
        const current = balance.get(playerId);
        if (current === undefined) return;
        balance.set(playerId, current + amount);
        await s.from("players").update({ points: current + amount }).eq("id", playerId);
      };

      const yes = (votes ?? []).filter(v => v.outcome).length;
      const no = (votes ?? []).length - yes;

      if (!votes?.length || yes === no) {
        for (const b of pool) await credit(b.player_id, b.amount);
        await s.from("predictions")
          .update({ status: "void", resolution_note: votes?.length ? "Tie vote — bets refunded." : "Nobody voted in time — bets refunded." })
          .eq("id", p.id);
        await s.from("activity").insert({
          room_id: p.room_id,
          message: `⚖️ “${p.question}” expired without a verdict. Bets refunded.`
        });
        settled++;
        continue;
      }

      const outcome = yes > no;
      const winners = pool.filter(b => b.choice === outcome);
      const total = pool.reduce((sum, b) => sum + b.amount, 0);
      const winningStake = winners.reduce((sum, b) => sum + b.amount, 0);

      if (winners.length && winningStake) {
        let distributed = 0;
        for (let i = 0; i < winners.length; i++) {
          const b = winners[i];
          const share = i === winners.length - 1 ? total - distributed : Math.floor(total * b.amount / winningStake);
          distributed += share;
          await credit(b.player_id, share);
        }
      } else {
        for (const b of pool) await credit(b.player_id, b.amount);
      }

      await s.from("predictions")
        .update({ status: "resolved", outcome, resolution_note: winners.length ? "Auto-settled by the room's vote." : "No winning bets — stakes refunded." })
        .eq("id", p.id);

      const names = winners
        .map(b => (players ?? []).find(x => x.id === b.player_id)?.nickname)
        .filter(Boolean);
      await s.from("activity").insert({
        room_id: p.room_id,
        message: `${outcome ? "✅ YES" : "❌ NO"} — “${p.question}” settled. ${names.length ? `Winners: ${names.join(", ")}` : "No winning bets; stakes refunded."}`
      });
      settled++;
    }

    return NextResponse.json({ closed: closed?.length ?? 0, settled });
  } catch (e) {
    const message = e instanceof Error ? e.message : "cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
