export type Player = { id:string; room_id:string; nickname:string; avatar:string; points:number; created_at:string };
export type Prediction = {
  id:string; room_id:string; author_id:string; subject_id:string; question:string;
  deadline:string; status:"open"|"voting"|"resolved"|"void"; outcome:boolean|null;
  yes_pool:number; no_pool:number; resolution_note:string|null; created_at:string;
};
export type Bet = { id:string; prediction_id:string; player_id:string; choice:boolean; amount:number };
export type Vote = { id:string; prediction_id:string; player_id:string; outcome:boolean };
export type Room = { id:string; code:string; name:string; vibe:string; created_at:string };
export const AVATARS = ["🦊","🐸","🐼","🐙","🦄","🐝","🦖","🐧","🦋","🐢","🦝","🐱"];