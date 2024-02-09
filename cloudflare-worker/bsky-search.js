import { fetchGuardedWithLogin } from "./bsky-fetch-guarded";

export async function searchPost(searchTerm, params,session) {
  let urlParams = {
    q: searchTerm,
  };
  if (params.count !== undefined) {
    urlParams.limit = params.count;
  }
  if (params.offset !== undefined) {
    urlParams.cursor = params.offset;
  }
  let url =
    "https://bsky.social/xrpc/app.bsky.feed.searchPosts?" + new URLSearchParams(urlParams);
  let response = await fetchGuardedWithLogin(url,session);
  if (response !== null) {
    return await response.json();
  } else {
    return null;
  }
}
