import {json} from './_auth.js';
export async function onRequestGet({env}){const r=await env.DB.prepare(`SELECT id,name,slug,description,amount_paise,duration_days FROM plans WHERE status='active' ORDER BY amount_paise`).all();return json({success:true,plans:r.results||[]});}
