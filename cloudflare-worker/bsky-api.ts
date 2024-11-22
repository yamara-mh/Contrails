import { fetchGuarded } from "./bsky-fetch-guarded";

export async function appBskyFeedGetAuthorFeed(accessJwt, did, limit = 30, isLatest = false, cursor = null) {
  if (accessJwt === null) return null;
  let params = {
    actor: did,
    limit: limit,
    possible_values: "posts_no_replies",
    includePins: true,
    sort: "",
    cursor: ""
  };
  if (isLatest) params.sort = "latest";
  if (cursor !== undefined && cursor !== null) params.cursor = cursor;
  
  const url = "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?" + new URLSearchParams(params as any);

  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${accessJwt}`,
    },
  } as any);
}

export async function appBskyFeedGetLikes(accessJwt, uri, limit = 30, cid = null, cursor = null) {
  if (accessJwt === null) return null;
  let params = {
    uri: uri,
    limit: limit,
    cid: "",
    cursor: "",
  };
  if (cid !== undefined && cid !== null) params.cid = cid;
  if (cursor !== undefined && cursor !== null) params.cursor = cursor;
  
  let url = "https://bsky.social/xrpc/app.bsky.feed.getLikes?" + new URLSearchParams(params as any);

  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${accessJwt}`,
    },
  } as any);
}