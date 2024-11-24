import { CONFIGS } from "./configs";
import { appBskyFeedGetAuthorFeed, appBskyFeedGetLikes } from "./bsky-api";
import { jsonResponse } from "./utils";
import { searchPost } from "./bsky-search";
import { resetFetchCount, setSafeMode } from "./bsky-fetch-guarded";
import { loginWithEnv, validateAuth } from "./bsky-auth";
import { log } from "console";
// import { from } from "linq-to-typescript";

const GET_LATEST_MY_POSTS = 50; // 閲覧者の投稿取得数
const GET_LIKES_MY_POSTS = 15; // 取得するいいねリストの数
const GET_LIKES_USER = 30; // いいねリストから取得するユーザの数

const GET_USERS_ON_PAGE = 10; // 1ページに読み込む人数
const GET_USER_POSTS_LIMIT = 30; // 表示候補数
const CHOICE_USER_POSTS_COUNT = 3; // 一人当たりの表示ポスト数
const GET_USER_LIMIT = 100; // 最大読込人数


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
  
  let accessJwt = await loginWithEnv(env);
  
  // const requesterDid = await validateAuth(request, ctx.cfg.serviceDid, ctx.didResolver);
  // console.log(requesterDid);
  // console.log(JSON.stringify(requesterDid));
  

  // 2周目。cursor に未閲覧ユーザがいたら表示
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

  // console.log(payload);
  // console.log(process.env.JWT_SECRET_KEY as string);
  // console.log(header.alg);
// 
  // jwt.verify(myAccessJwtStr, process.env.JWT_SECRET_KEY as string, { algorithms: ['RS256'] }, function(err:{}, decoded:{}) {
  //   console.log(decoded);
  // });
  // 
  // const token = jwt.sign(payload, "C5D489224B814890B659620F758E281B", { algorithm: "ES256K" }); // header.alg 
  // console.log(token);
  
  
  // 閲覧者の最新ポストを取得
  let myFeed = [];
  let myFeedHandle = await fetchUser(accessJwt, payload.iss, GET_LATEST_MY_POSTS, true);
  if (Array.isArray(myFeedHandle.feed)) {
    myFeed = myFeedHandle.feed;
  }

  if (myFeed.length == 0) return jsonResponse({ feed: null, cursor: "" });

  const filteredPosts: any = [];
  let filteredFeedCount = 0;
  for (let itemIdx = 0; itemIdx < myFeed.length; itemIdx++) {
    const item = myFeed[itemIdx] as any;

    // ピン止めしているポストは確実に取得
    if (item.post.viewer.pinned) {
      filteredPosts.push(item);
      filteredFeedCount++;
      continue;
    }

    // いいね割合の多いポストを優先的に選ぶ？

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

  const likedUsers: any = [];
  for (let i = 0; i < likedUserResults.length; i++) {
    if (likedUserResults[i].status === "rejected") continue;
    const likes = likedUserResults[i].value.likes;
    for (let li = 0; li < likes.length; li++){
      likes[li].createdMS = new Date(likes[li].createdAt).getUTCMilliseconds;
      likedUsers.push(likes[li]);
      console.log(`${likes[li].actor.displayName} ${likes[li].createdAt}`);
      
    }

    // for (let li = 0; li < likes.length; li++) {
      // TODO ミュートを除外　APIを呼ぶユーザの情報が利用されてしまう
      // if (likes[li].actor.viewer.muted === true) continue;
      // likedUsers.push(likes[li]);
    // }
  }

  // 最近のいいね順に並べ替えて重複を除く
  // likedUsers = from(likedUsers).orderByDescending(l => l.createdAt).toArray(); linq のインポート方法が分からない
  likedUsers.sort((a, b) => a.createdMS === b.createdMS ? 0 : a.createdMS > b.createdMS ? -1 : 1);
  const likedUserDids: any = new Set();
  for (let i = 0; i < likedUsers.length; i++) {
    likedUserDids.add(likedUsers[i].actor.did);
    if (likedUserDids.count == GET_USER_LIMIT) break;
  }

  return LoadUsersPosts(accessJwt, Array.from(likedUserDids));
}

async function LoadUsersPosts(accessJwt, targetDids = []) {
  const loadDids = targetDids.slice(0, GET_USERS_ON_PAGE);

  // いいねした人の最新ポストを取得
  const likedUserPostResults: any = await Promise.allSettled(
    loadDids.map(item => fetchUser(accessJwt, item, GET_USER_POSTS_LIMIT, true, null, false)));

  const items: any = [];
  for (let ri = 0; ri < likedUserPostResults.length; ri++) {
    if (likedUserPostResults[ri].status === "rejected") continue;
    const feed = likedUserPostResults[ri].value.feed;
    if (feed == undefined) continue;

    const validFeed = feed.filter(f => CheckVaildPost(f));

    if (validFeed.length <= CHOICE_USER_POSTS_COUNT){
      items.push(...validFeed);
      continue;
    }

    // 最新10、20件、30件でいいねが多い投稿を表示
    const choicedItems = [];
    const sliceLength = Math.ceil(validFeed.length / CHOICE_USER_POSTS_COUNT);
    for (let i = 0; i < Math.min(validFeed.length, CHOICE_USER_POSTS_COUNT); i++) {
      const one = validFeed.slice(0, sliceLength * (i + 1)).reduce((a, c) => {
        if (a == null) return c;
        if (choicedItems.length > 0 && choicedItems.some(i => i.post.cid === c.post.cid)) return a;
        return c.post.likeCount > a.post.likeCount ? c : a;
      }, null);
      if (one != null) choicedItems.push(one);
    }
    items.push(...choicedItems);
  }

  const feed: any = [];
  for (let item of items) feed.push({ post: item.post.uri });

  const nextLoadArray = targetDids.slice(GET_USERS_ON_PAGE);
  if (nextLoadArray.length === 0) return jsonResponse({ feed: feed, cursor: ""});

  return jsonResponse({ feed: feed, cursor: JSON.stringify({ viewed_dids: nextLoadArray }) });
}
      
function CheckVaildPost(item: any) {
      // TODO ミュートスレッドを除外　APIを呼ぶユーザの情報が利用されてしまう
      // if (item.post.viewer.threadMuted === true) continue;
      // リプライとリポストを除外
      if (item.post === undefined || item.post.record === undefined) return false;
      if (item.reply !== undefined || item.reason !== undefined) return false;
      // 既にいいねした投稿を除外　APIを呼ぶユーザの情報が利用されてしまう
      // if (item.post.viewer.like !== undefined) continue;
      return true;
}

async function fetchUser(accessJwt, user, limit = 30, isLatest = false, cursor = null, includePins = true) {
  let response = await appBskyFeedGetAuthorFeed(accessJwt, user, limit, isLatest, cursor, includePins);
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
