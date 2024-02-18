import { fetchGuardedWithLogin } from "./bsky-fetch-guarded";

export async function searchPost(searchTerm, params,accessJwt) {
  let urlParams = {
    q: searchTerm,
  };
  if (params.count !== undefined) {
    // @ts-expect-error TS(2339): Property 'limit' does not exist on type '{ q: any;... Remove this comment to see the full error message
    urlParams.limit = params.count;
  }
  if (params.offset !== undefined) {
    // @ts-expect-error TS(2339): Property 'cursor' does not exist on type '{ q: any... Remove this comment to see the full error message
    urlParams.cursor = params.offset;
  }
  let url =
    "https://bsky.social/xrpc/app.bsky.feed.searchPosts?" + new URLSearchParams(urlParams);
    console.log(accessJwt);
  //let response = await fetchGuardedWithLogin(url,accessJwt);

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
