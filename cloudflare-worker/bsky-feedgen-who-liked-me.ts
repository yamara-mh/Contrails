import { CONFIGS } from "./configs";
import { appBskyFeedGetAuthorFeed, appBskyFeedGetLikes } from "./bsky-api";
import { jsonResponse } from "./utils";
import { searchPost } from "./bsky-search";
import { resetFetchCount, setSafeMode } from "./bsky-fetch-guarded";
import { loginWithEnv, validateAuth } from "./bsky-auth";
import { jwt } from "jsonwebtoken";

const GET_LATEST_MY_POSTS = 50;
const GET_LIKES_MY_POSTS = 10; // 10
const GET_LIKES_USER = 10; // 10
const GET_USERS_ON_PAGE = 10; // 10
const GET_USER_POSTS_LIMIT = 15;

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

  console.log("test");
  console.log(JSON.stringify(ctx));
  console.log(Object.values(ctx));
  console.log(Object.keys(ctx));

  const url = new URL(request.url);
  const feedAtUrl = url.searchParams.get("feed");
  if (feedAtUrl === null) {
    console.warn(`feed parameter missing from query string`);
    return feedJsonResponse([]);
  }

  resetFetchCount(); // for long-lived processes (local)
  setSafeMode(true);
  
  let accessJwt = null;
  accessJwt = await loginWithEnv(env);

  
  // const requesterDid = await validateAuth(request, ctx.cfg.serviceDid, ctx.didResolver);
  // console.log(requesterDid);
  // console.log(JSON.stringify(requesterDid));
  

  // cursor に未閲覧ユーザがいたら表示
  const viewedDids = new Set();
  let cursorParam = url.searchParams.get("cursor");
  
  if (cursorParam !== undefined && cursorParam !== null && cursorParam.trim().length > 0) {
    return await LoadUsersPosts(accessJwt, JSON.parse(cursorParam).viewed_dids);
  }
  


  // 閲覧者の通知を取得して、いいねしたユーザを列挙した方が簡潔な気がする
  // サーバが閲覧者の通知取得APIを呼べるのは危うい気がするけど、呼べるのか？

  const myAccessJwt = request.headers.get("Authorization");
  const myAccessJwtStr = myAccessJwt.toString().replace("Bearer ", "");
  const headerStr = myAccessJwtStr.split(".")[0];
  const header = JSON.parse(atob(headerStr));
  const payloadStr = myAccessJwtStr.split(".")[1];
  const payload = JSON.parse(atob(payloadStr));

  console.log(header);
  console.log(payload);

  const token = jwt.sign(payload, env.JWT_SECRET_KEY, { algorithm: header.alg });
  
  // 閲覧者の最新ポストを取得
  let myFeed = [];
  let myFeedHandle = await fetchUser(token, payload.iss, GET_LATEST_MY_POSTS, true);
  if (Array.isArray(myFeedHandle.feed)) {
    myFeed = myFeedHandle.feed;
  }

  if (myFeed.length == 0) return jsonResponse({ feed: null, cursor: "" });

  const filteredPosts: any = [];
  let filteredFeedCount = 0;
  for (let itemIdx = 0; itemIdx < myFeed.length; itemIdx++) {
    const item = myFeed[itemIdx] as any;

    // リプライとリポスト、いいね0を除外
    if (item.post === undefined || item.post.record === undefined) continue;
    if (item.reply !== undefined || item.reason !== undefined) continue;
    if (item.post.likeCount == 0) continue;
    if (filteredPosts.some(f => (f as any).post.uri == item.post.uri)) continue;

    filteredPosts.push(item);
    if (++filteredFeedCount >= GET_LIKES_MY_POSTS) break;
  }
  
  // いいねしたユーザを取得
  const likedUserResults: any = await Promise.allSettled(
    filteredPosts.map(item => fetchLikes(accessJwt, item.post.uri, GET_LIKES_USER)));

  const likedUserDidsSet: any = new Set();
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

  return LoadUsersPosts(accessJwt, Array.from(likedUserDidsSet));
}

async function LoadUsersPosts(accessJwt, targetDids = []) {
  const loadDids = targetDids.slice(0, GET_USERS_ON_PAGE);

  // いいねした人のポストを取得
  const likedUserPostResults: any = await Promise.allSettled(
    loadDids.map(item => fetchUser(accessJwt, item, GET_USER_POSTS_LIMIT, false)));

  const items: any = [];
  for (let ri = 0; ri < likedUserPostResults.length; ri++) {
    if (likedUserPostResults[ri].status === "rejected") continue;

    let pushCount = 0;
    const feed = likedUserPostResults[ri].value.feed;
    if (feed == undefined) continue;
    for (let pi = 0; pi < feed.length; pi++) {
      const item = feed[pi] as any;
      // ミュートスレッドを除外
      if (item.post.viewer.threadMuted === true) continue;
      // リプライとリポストを除外
      if (item.post === undefined || item.post.record === undefined) continue;
      if (item.reply !== undefined || item.reason !== undefined) continue;
      // 既にいいねした投稿を除外
      if (item.post.viewer.like !== undefined) continue;
      
      items.push(item);
      if (++pushCount == CHOICE_USER_POSTS_COUNT) break;
    }
  }

  const feed: any = [];
  for (let item of items) feed.push({ post: item.post.uri });

  const nextLoadArray = targetDids.slice(GET_USERS_ON_PAGE);
  if (nextLoadArray.length === 0) return jsonResponse({ feed: feed, cursor: ""});

  return jsonResponse({ feed: feed, cursor: JSON.stringify({ viewed_dids: nextLoadArray }) });
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
  if (cursor !== null) (response as any).cursor = cursor;
  return jsonResponse(response);
}
