import OpenAI from "openai";
import { NextResponse } from "next/server";
export async function POST(req:Request) {
  try {
    const {kind, question, outcome, winnerNames, leaderboard, roomName} = await req.json();
    const safe = (x:unknown)=>String(x ?? "").slice(0,600);
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({text:kind==="weekly" ? "The leaderboard has spoken. The points are imaginary, but the bragging rights are painfully real." : `The room has ruled: ${safe(question)} — ${outcome ? "YES" : "NO"}. ${safe((winnerNames||[]).join(", "))} called it. Screenshot this moment.`});
    }
    const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const input = kind==="weekly"
      ? `Room: ${safe(roomName)}. Leaderboard: ${JSON.stringify(leaderboard).slice(0,1500)}. Write a playful, affectionate 2-3 sentence weekly roast. Roast scores and game habits, not identities or sensitive traits.`
      : `Room: ${safe(roomName)}. Prediction: ${safe(question)}. Outcome: ${outcome ? "YES" : "NO"}. Winners: ${safe((winnerNames||[]).join(", "))}. Write a playful 1-2 sentence recap, kind not cruel.`;
    const moderation = await client.moderations.create({model:"omni-moderation-latest",input});
    if (moderation.results[0]?.flagged) return NextResponse.json({text:"The votes are in, the points have moved, and the group chat will absolutely remember this."});
    const r = await client.chat.completions.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",messages:[{role:"system",content:"You are a witty, warm game-show commentator for a friends-and-family prediction game. Keep it short, playful, never cruel, no slurs, no sensitive personal details."},{role:"user",content:input}],temperature:0.8,max_tokens:120});
    return NextResponse.json({text:r.choices[0]?.message.content || "The room has spoken!"});
  } catch { return NextResponse.json({text:"The room has spoken! The receipts are in, and the bragging rights are official."}); }
}