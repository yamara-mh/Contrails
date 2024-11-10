import { fetchGuarded } from "./bsky-fetch-guarded";

export async function appBskyFeedGetAuthorFeed(accessJwt, did, limit = 30, cursor = null) {
  if (accessJwt === null) {
    return null;
  }
  let params = {
    actor: did,
    limit: limit,
  };
  if (cursor !== undefined && cursor !== null) {
    params.cursor = cursor;
  }
  
  const url = 
    "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?" +
    new URLSearchParams(params);
  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${accessJwt}`,
    },
  });
}
