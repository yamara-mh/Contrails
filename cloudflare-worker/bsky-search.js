import { fetchGuarded2 } from "./bsky-fetch-guarded";

export async function searchPost(searchTerm, params,session) {
  let urlParams = {
    q: searchTerm,
  };
  if (params.count !== undefined) {
    urlParams.count = params.count;
  }
  if (params.offset !== undefined) {
    urlParams.offset = params.offset;
  }
  console.log('koko');
  let url =
    "https://bsky.social/xrpc/app.bsky.feed.searchPosts?" + new URLSearchParams(urlParams);
  let response = await fetchGuarded2(url,session);
  if (response !== null) {
    return await response.json();
  } else {
    return null;
  }
}
