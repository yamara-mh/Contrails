import { feedGeneratorWellKnown, getFeedSkeleton } from "./bsky-feedgen-who-liked-me" // "./bsky-feedgen-who-liked-me.ts";

export default {
  async fetch(request, env, ctx) {
    console.clear();
    
    // lame-o routing
    if (request.url.endsWith("/.well-known/did.json")) {

      console.log("well-known");
      console.log(JSON.stringify(request));
      console.log(JSON.stringify(ctx));
      
      return await feedGeneratorWellKnown(request);
    }
    if (request.url.indexOf("/xrpc/app.bsky.feed.getFeedSkeleton") > -1) {

      console.log("getFeedSkeleton");
      console.log(JSON.stringify(request));
      console.log(JSON.stringify(ctx));
      
      return await getFeedSkeleton(request, env, ctx);
    }
    return new Response(`{}`);
  },
};
