import OpenAI from "openai";
import { NextResponse } from "next/server";
const fallback = [
  "Will someone here say “I’m five minutes away” while still at home?",
  "Who is most likely to accidentally start a new hobby this week?",
  "Will the group chat go 24 hours without a side quest?",
  "Who will send the most dramatic voice note before Friday?"
];
export async function POST(req:Request) {
  try {
    const body = await req.json();
    const names = Array.isArray(body.players) ? body.players.slice(0,12).map((x:unknown)=>String(x).slice(0,30)) : [];
    const vibe = String(body.vibe || "playful friends").slice(0,120);
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ideas:fallback });
    const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response = await client.moderations.create({model:"omni-moderation-latest",input:`Generate friendly predictions for a group called ${vibe}. Names: ${names.join(", ")}.`});
    if (response.results[0]?.flagged) return NextResponse.json({ideas:fallback});
    const completion = await client.chat.completions.create({
      model:process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages:[
        {role:"system",content:"You suggest friendly, light-hearted, opt-in social prediction game prompts. Never target protected traits, appearance, health, trauma, sex, illegal activity, humiliation, or personal vulnerabilities. No harassment, accusations, or dangerous dares. Use names only as playful context. Return strict JSON: {\"ideas\":[\"...\", \"...\", \"...\"]}. Questions should be verifiable within a few days."},
        {role:"user",content:`Room vibe: ${vibe}. Players: ${names.join(", ") || "a group of friends"}. Create 5 varied, kind prompts.`}
      ], response_format:{type:"json_object"}, temperature:0.9
    });
    const parsed = JSON.parse(completion.choices[0]?.message.content || "{}");
    return NextResponse.json({ideas:Array.isArray(parsed.ideas)?parsed.ideas.slice(0,5):fallback});
  } catch { return NextResponse.json({ideas:fallback}); }
}