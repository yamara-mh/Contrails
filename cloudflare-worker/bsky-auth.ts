import { fetchGuarded } from "./bsky-fetch-guarded"
import express from 'express'
import { verifyJwt, AuthRequiredError, parseReqNsid } from '@atproto/xrpc-server'
import { DidResolver } from '@atproto/identity'

export async function loginWithEnv(env) {
  return await login(env.BLUESKY_HANDLE, env.BLUESKY_APP_PASSWORD, env);
}

async function login(username, password, env) {
  let { results } = await env.DB.prepare(
    "SELECT * FROM accessJwt WHERE id = 1"
  ).all();

  const savedJwt = results[0].accessJwt;
  const sessionCheck = 'https://bsky.social/xrpc/com.atproto.server.getSession';
  let checkResult = await fetch(sessionCheck,{
    headers: {
      Authorization: `Bearer ${savedJwt}`,
    }})  

  if(checkResult.status === 200){
    console.log('valid session.');
    return savedJwt;
  }

  console.log('session expired.')

  const url = "https://bsky.social/xrpc/com.atproto.server.createSession";
  const body = {
    identifier: username,
    password: password,
  };
  const init = {
    body: JSON.stringify(body),
    method: "POST",
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
  };
  let response = await fetchGuarded(url, init);
  if (response !== null) {
    let session = await response.json();
    console.log(session);
    let { results } = await env.DB.prepare(
      "Update accessJwt set accessJwt = ? WHERE id = 1"
    )
    .bind(session.accessJwt).all();


    if (session["error"] === undefined) {
      return session.accessJwt;
    }
  }
  return null;
}

export const validateAuth = async (
  req: express.Request,
  serviceDid: string,
  didResolver: DidResolver,
): Promise<string> => {
  const { authorization = '' } = req.headers
  if (!authorization.startsWith('Bearer ')) {
    throw new AuthRequiredError()
  }
  const jwt = authorization.replace('Bearer ', '').trim()
  const nsid = parseReqNsid(req)
  const parsed = await verifyJwt(jwt, serviceDid, nsid, async (did: string) => {
    return didResolver.resolveAtprotoKey(did)
  })
  return parsed.iss
}