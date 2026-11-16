import { createClient } from "@supabase/supabase-js";

// The shop owner supplied this exact Roblox game URL:
// https://www.roblox.com/games/83672252722635/Mangingisda
const gameId = "70f8f91d-f5f0-465f-a3b7-fa3332c106ff";
const placeId = "83672252722635";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: game, error: gameError } = await admin.from("games")
  .select("id,name,icon_url").eq("id", gameId).single();
if (gameError) throw gameError;
if (game.name !== "Mangingisda") throw new Error("Target game ID does not match Mangingisda");

const thumbnailApi = new URL("https://thumbnails.roblox.com/v1/places/gameicons");
thumbnailApi.searchParams.set("placeIds", placeId);
thumbnailApi.searchParams.set("size", "512x512");
thumbnailApi.searchParams.set("format", "Png");
thumbnailApi.searchParams.set("isCircular", "false");
const response = await fetch(thumbnailApi, { headers: { "User-Agent": "Mozilla/5.0" } });
if (!response.ok) throw new Error(`Roblox icon request failed: ${response.status}`);
const { data } = await response.json();
if (!Array.isArray(data) || data.length !== 1 || String(data[0].targetId) !== placeId ||
  data[0].state !== "Completed") {
  throw new Error("Roblox did not return a completed icon for the supplied place ID");
}
const iconUrl = new URL(data[0].imageUrl);
if (iconUrl.protocol !== "https:" || iconUrl.hostname !== "tr.rbxcdn.com" ||
  !iconUrl.pathname.includes("/512/512/Image/Png/")) {
  throw new Error("Unexpected Roblox icon URL");
}
const icon = await fetch(iconUrl, { method: "HEAD" });
if (!icon.ok || !icon.headers.get("content-type")?.startsWith("image/")) {
  throw new Error("Roblox icon image is not reachable");
}

if (game.icon_url && game.icon_url !== iconUrl.href) {
  throw new Error("Mangingisda already has a different icon; no replacement made");
}
if (!game.icon_url) {
  const { data: updated, error: updateError } = await admin.from("games")
    .update({ icon_url: iconUrl.href }).eq("id", gameId).is("icon_url", null)
    .select("id,icon_url").single();
  if (updateError) throw updateError;
  if (updated.icon_url !== iconUrl.href) throw new Error("Icon update verification failed");
  console.log("Set official Mangingisda game icon");
}

const { data: visible, error: viewError } = await publicClient.from("store_games")
  .select("id,name,slug,icon_url").eq("id", gameId).single();
if (viewError) throw viewError;
if (visible.name !== "Mangingisda" || visible.slug !== "mangingisda" || visible.icon_url !== iconUrl.href) {
  throw new Error("Official icon is not visible in the public game catalog");
}
console.log(`Verified official icon in public catalog: ${iconUrl.href}`);
