import OpenAI from "openai";
import { NextResponse } from "next/server";
const blocked = /\b(kill yourself|go die|racial slur|rape|doxx|blackmail)\b/i;
export async function POST(req:Request) {
  try {
    const {text}=await req.json();
    const value=String(text||"").slice(0,500);
    if(blocked.test(value)) return NextResponse.json({allowed:false});
    if(!process.env.OPENAI_API_KEY) return NextResponse.json({allowed:true});
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const r=await client.moderations.create({model:"omni-moderation-latest",input:value});
    return NextResponse.json({allowed:!r.results[0]?.flagged});
  } catch { return NextResponse.json({allowed:true}); }
}