import { fetchGuarded } from "./bsky-fetch-guarded";

export async function appBskyFeedGetAuthorFeed(accessJwt, did, cursor = null) {
  if (accessJwt === null) {
    return null;
  }
  let params = {
    actor: did,
    limit: 30,
  };
  if (cursor !== undefined && cursor !== null) {
    params.cursor = cursor;
  }
  const url = 
    "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?" +
    new URLSearchParams(params);
  // console.log("bsky-api did {did}");
  // console.log("bsky-api accessJwt {accessJwt}");
  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${accessJwt}`,
    },
  });
}
