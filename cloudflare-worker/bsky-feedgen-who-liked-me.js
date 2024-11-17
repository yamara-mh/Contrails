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
const SUM_GET_USERS = 50; // 50
const GET_USERS_ON_PAGE = 5; // 10
const GET_USER_POSTS_LIMIT = 30;

const LATEST_BONUS_PERIOD_SEC = 86400 * 7;
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

  resetFetchCount(); // for long-lived processes (local)
  setSafeMode(true);
  
  let accessJwt = null;
  accessJwt = await loginWithEnv(env);

  

  // cursor に未閲覧ユーザがいたら表示
  const viewedDids = new Set();
  let cursorParam = url.searchParams.get("cursor");
  console.log(cursorParam);
  
  if (cursorParam !== undefined && cursorParam !== null && cursorParam.trim().length > 0) {
    return await LoadUsersPosts(accessJwt, JSON.parse(cursorParam).viewed_dids);
  }



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

  return LoadUsersPosts(accessJwt, Array.from(likedUserDidsSet).slice(0, SUM_GET_USERS));
}

async function LoadUsersPosts(accessJwt, targetDids = []) {
  const loadDids = targetDids.slice(0, GET_USERS_ON_PAGE);

  // いいねした人のポストを取得
  const likedUserPostResults = await Promise.allSettled(
    loadDids.map(item => fetchUser(accessJwt, item, GET_USER_POSTS_LIMIT, true)));

  const items = [];
  const nowTime = Date.now();
  for (let ri = 0; ri < likedUserPostResults.length; ri++) {
    if (likedUserPostResults[ri].status === "rejected") continue;

    let filterdItems = [];
    const sortedLikeCounts = [1, 0, 0]; // CHOICE_USER_POSTS_COUNT

    const feed = likedUserPostResults[ri].value.feed;
    for (let pi = 0; pi < feed.length; pi++) {
      const item = feed[pi];
      // ミュートスレッドを除外
      if (item.post.viewer.threadMuted === true) continue;
      // リプライとリポストを除外
      if (item.post === undefined || item.post.record === undefined) continue;
      if (item.reply !== undefined || item.reason !== undefined) continue;
      // 既にいいねした投稿を除外
      if (item.post.viewer.like !== undefined) continue;
      
      filterdItems.push(item);

      for (let li = 0; li < CHOICE_USER_POSTS_COUNT; li++) {
        if (item.post.likeCount <= sortedLikeCounts[li]) continue;
        for (let i = CHOICE_USER_POSTS_COUNT - 1; i > li; i--) sortedLikeCounts[i] = sortedLikeCounts[i - 1];
        sortedLikeCounts[li] = item.post.likeCount;
        console.log(item.post.likeCount);
      }
    }
    console.log(sortedLikeCounts[0]);
    
    const latestBonusLikeCount = (sortedLikeCounts[0] + sortedLikeCounts[1] + sortedLikeCounts[2]) / CHOICE_USER_POSTS_COUNT;
    console.log(`topAverageLikeCount ${latestBonusLikeCount}`);

    filterdItems.forEach(item => {
      const elapsedSec = nowTime - new Date(item.post.indexedAt);
      console.log(elapsedSec);
      console.log((new Date(elapsedSec).getSeconds).toString());
    });
    

    // いいねが多い順に表示
    // TODO 新しい投稿の評価を上げる　現在時間との差を出す
    filterdItems = Enumerable.from(filterdItems).orderBy(item => {
      const elapsedSec = new Date(nowTime - new Date(item.post.indexedAt)).getSeconds;

      let addLikeCount = 0;
      if (elapsedSec < LATEST_BONUS_PERIOD_SEC) {
        const rate = 1 - (LATEST_BONUS_PERIOD_SEC - elapsedSec) / LATEST_BONUS_PERIOD_SEC;
        addLikeCount += rate * latestBonusLikeCount;
      }
      return item.post.likeCount + addLikeCount;
    }).take(CHOICE_USER_POSTS_COUNT);

    /*
    filterdItems = filterdItems.toSorted((b, a)
    => a.post.likeCount === b.post.likeCount ? 0 : a.post.likeCount < b.post.likeCount ? -1 : 1);
    */

    items.push(...filterdItems);
  }

  const feed = [];
  for (let item of items) feed.push({ post: item.post.uri });

  const nextLoadArray = targetDids.slice(GET_USERS_ON_PAGE);
  if (nextLoadArray.length === 0) {
    console.log("empty");
    return jsonResponse({ feed: feed, cursor: ""}); // `{ type: "e" }` });
  }

  const cursor = ""; // JSON.stringify({type: "s", viewed_dids: nextLoadArray });
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
