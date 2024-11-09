import { feedGeneratorWellKnown, getFeedSkeleton } from "./bsky-feedgen-who-liked-me.js";

export default {
  async fetch(request, env, ctx) {
    console.clear();
    console.log("worker");
    console.log(env);
    console.log(JSON.stringify(request));
    console.log(JSON.stringify(ctx));
    // lame-o routing
    if (request.url.endsWith("/.well-known/did.json")) {
      return await feedGeneratorWellKnown(request);
    }
    if (request.url.indexOf("/xrpc/app.bsky.feed.getFeedSkeleton") > -1) {
      return await getFeedSkeleton(request, env);
    }
    return new Response(`{}`);
  },
};
