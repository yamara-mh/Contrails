import { fetchGuarded } from "./bsky-fetch-guarded";

export async function searchPost(searchTerm, params,accessJwt) {
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

  let response = await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${accessJwt}`,
    },
  })

  if (response !== null) {
    let resbody = await response.json();
    return resbody;
  } else {
    return null;
  }
}
