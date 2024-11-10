import { feedGeneratorWellKnown, getFeedSkeleton } from "./bsky-feedgen-who-liked-me.js";

export default {
  async fetch(request, env, ctx) {
    console.clear();
    // lame-o routing
    if (request.url.endsWith("/.well-known/did.json")) {
      return await feedGeneratorWellKnown(request);
    }
    if (request.url.indexOf("/xrpc/app.bsky.feed.getFeedSkeleton") > -1) {
      console.log("getFeedSkeleton");
      console.log(request.headers.get("Authorization"));
      return await getFeedSkeleton(request, env);
    }
    return new Response(`{}`);
  },
};
