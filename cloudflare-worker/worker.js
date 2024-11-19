import { feedGeneratorWellKnown, getFeedSkeleton } from "./bsky-feedgen-who-liked-me.ts"; // "./bsky-feedgen-who-liked-me.ts";

export default {
  async fetch(request, env, ctx) {
    console.clear();
    
    // lame-o routing
    if (request.url.endsWith("/.well-known/did.json")) {
      return await feedGeneratorWellKnown(request);
    }
    if (request.url.indexOf("/xrpc/app.bsky.feed.getFeedSkeleton") > -1) {
      return await getFeedSkeleton(request, env, ctx);
    }
    return new Response(`{}`);
  },
};
