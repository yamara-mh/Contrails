import { fetchGuarded } from "./bsky-fetch-guarded";

export async function appBskyFeedGetAuthorFeed(accessJwt, did, limit = 30, isLatest = false, cursor = null) {
  if (accessJwt === null) return null;
  let params = {
    actor: did,
    limit: limit,
  };
  if (cursor !== undefined && cursor !== null) params.cursor = cursor;
  
  let url = "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?" + new URLSearchParams(params);
  if (isLatest) url += "&sort=latest";

  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${accessJwt}`,
    },
  });
}

export async function appBskyFeedGetLikes(accessJwt, uri, cid = null, limit = 30, cursor = null) {
  if (accessJwt === null) return null;
  let params = {
    uri: uri,
    limit: limit,
  };
  if (cid !== undefined && cid !== null) params.cid = cid;
  if (cursor !== undefined && cursor !== null) params.cursor = cursor;
  
  let url = "https://bsky.social/xrpc/app.bsky.feed.getLikes?" + new URLSearchParams(params);

  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${accessJwt}`,
    },
  });
}