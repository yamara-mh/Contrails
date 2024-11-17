import { CONFIGS } from "./configs";
import { appBskyFeedGetAuthorFeed, appBskyFeedGetLikes } from "./bsky-api";
import { jsonResponse } from "./utils";
import { searchPost } from "./bsky-search";
import { resetFetchCount, setSafeMode } from "./bsky-fetch-guarded";
import { loginWithEnv } from "./bsky-auth";
import Enumerable from 'linq';

const GET_LATEST_MY_POSTS = 50;
const GET_LIKES_MY_POSTS = 5; // 10
const GET_LIKES_USER = 5; // 50
const SUM_LIKED_USERS = 5; // 20
const LIKED_USER_POSTS_LIMIT = 30;
const CHOICE_USER_POSTS_COUNT = 3;

export async function feedGeneratorWellKnown(request) {
  let host = request.headers.get("Host");
  let didJson = {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `did:web:${host}`,
    alsoKnownAs: [],
    authentication: null,
    verificationMethod: [],
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `https://${host}`,
      },
    ],
  };
  return jsonResponse(didJson);
}

export async function getFeedSkeleton(request, env, ctx) {  
  const url = new URL(request.url);
  const feedAtUrl = url.searchParams.get("feed");
  if (feedAtUrl === null) {
    console.warn(`feed parameter missing from query string`);
    return feedJsonResponse([]);
  }

  const json_parse = JSON.parse(request);
  Object.keys(json_parse).forEach(function (key) {
    console.log('key:', key);
    console.log('json_parse:', json_parse.family);
  });

  // cursor から閲覧済みのユーザを取得
  const viewedDids = new Set();
  let cursorParam = url.searchParams.get("cursor");
  if (cursorParam !== undefined && cursorParam !== null && cursorParam.trim().length > 0) {
    const dids = JSON.parse(cursorParam).viewed_dids;
    for (let i = 0; i < dids.length; i++) viewedDids.add(dids[i]);
  }

  resetFetchCount(); // for long-lived processes (local)
  setSafeMode(true);
  
  let accessJwt = null;
  accessJwt = await loginWithEnv(env);



  // 閲覧者の通知を取得して、いいねしたユーザを列挙した方が簡潔な気がする
  // サーバが閲覧者の通知取得APIを呼べるのは危うい気がするけど、呼べるのか？

  const myAccessJwt = request.headers.get("Authorization");
  const myAccessJwtStr = myAccessJwt.toString().replace("Bearer ", "");
  const payloadStr = myAccessJwtStr.split(".")[1];
  const payload = JSON.parse(atob(payloadStr));
  
  // 閲覧者の最新ポストを取得
  let myFeed = [];
  let myFeedHandle = await fetchUser(accessJwt, payload.iss, GET_LATEST_MY_POSTS, true);
  if (Array.isArray(myFeedHandle.feed)) {
    myFeed = myFeedHandle.feed;
  }

  if (myFeed.length == 0) {
    console.log("No posts");
    return jsonResponse({ feed: null, cursor: "" });
  }

  const filteredPosts = [];
  let filteredFeedCount = 0;
  for (let itemIdx = 0; itemIdx < myFeed.length; itemIdx++) {
    const item = myFeed[itemIdx];
    // リプライとリポスト、いいね0を除外
    if (item.post === undefined || item.post.record === undefined) continue;
    if (item.reply !== undefined || item.reason !== undefined) continue;
    if (item.post.likeCount == 0) continue;
    if (filteredPosts.some(f => f.post.uri == item.post.uri)) continue;

    filteredPosts.push(item);
    if (++filteredFeedCount >= GET_LIKES_MY_POSTS) break;
  }
  
  // いいねしたユーザを取得
  const likedUserResults = await Promise.allSettled(
    filteredPosts.map(item => fetchLikes(accessJwt, item.post.uri, GET_LIKES_USER)));

  const likedUserDidsSet = new Set();
  for (let ri = 0; ri < likedUserResults.length; ri++) {
    if (likedUserResults[ri].status === "rejected") continue;
    const likes = likedUserResults[ri].value.likes;
    for (let li = 0; li < likes.length; li++) {
      // 閲覧済みのユーザを除外
      if (viewedDids.has(likes[li].actor.did)) continue;
      // ミュートを除外
      if (likes[li].actor.viewer.muted === true) continue;
      likedUserDidsSet.add(likes[li].actor.did);
    }
  }

  // 取得したユーザを全員見ていたら終了
  if (likedUserDidsSet.count === 0) return jsonResponse({ feed: [], cursor: "" });

  const likedUserDids = Array.from(likedUserDidsSet)
    .slice(0/* cursor で何人目まで表示したか記録できたら便利 */, SUM_LIKED_USERS);

  // いいねした人のポストを取得
  const likedUserPostResults = await Promise.allSettled(
    likedUserDids.map(item => fetchUser(accessJwt, item, LIKED_USER_POSTS_LIMIT, true)));

  const items = [];
  for (let ri = 0; ri < likedUserPostResults.length; ri++) {
    if (likedUserPostResults[ri].status === "rejected") continue;

    const feed = likedUserPostResults[ri].value.feed;
    let filterdPosts = [];
    for (let pi = 0; pi < feed.length; pi++) {
      const item = feed[pi];
      // ミュートスレッドを除外
      if (item.post.viewer.threadMuted === true) continue;
      // リプライとリポストを除外
      if (item.post === undefined || item.post.record === undefined) continue;
      if (item.reply !== undefined || item.reason !== undefined) continue;
      // 既にいいねした投稿を除外
      if (item.post.viewer.like !== undefined) continue;
      
      filterdPosts.push(item);
    }
    // いいねが多い順に表示
    filterdPosts = filterdPosts
      .toSorted((b, a) => {
        a.post.likeCount === b.post.likeCount ? 0 : a.post.likeCount < b.post.likeCount ? -1 : 1;
      });

    const sliceCount = Math.min(CHOICE_USER_POSTS_COUNT, filterdPosts.length);
    if (sliceCount > 0) items.push(...filterdPosts.slice(0, sliceCount));
  }

  const feed = [];
  for (let item of items) feed.push({ post: item.post.uri });
  
  const cursor = JSON.stringify( {viewed_dids : likedUserDids } );
  console.log(cursor);  
  return jsonResponse({ feed: feed, cursor: cursor });
}

async function fetchUser(accessJwt, user, limit = 30, isLatest = false, cursor = null) {
  let response = await appBskyFeedGetAuthorFeed(accessJwt, user, limit, isLatest, cursor);
  if (response !== null) return await response.json();
  return null;
}
async function fetchLikes(accessJwt, uri, limit = 10, cid = null, cursor = null) {
  let response = await appBskyFeedGetLikes(accessJwt, uri, limit, cid, cursor);
  if (response !== null) return await response.json();
  return null;
}

function feedJsonResponse(items, cursor = null) {
  let response = { feed: items };
  if (cursor !== null) response.cursor = cursor;
  return jsonResponse(response);
}
