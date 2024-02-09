export let fetchCount = 0;
let SAFE_MODE = true;
const MAX_FETCHES = 7;

export function resetFetchCount() {
  fetchCount = 0;
}

export function setSafeMode(safeMode) {
  SAFE_MODE = safeMode;
}

function getSafeMode() {
  return SAFE_MODE;
}

export async function fetchGuarded() {
  if (getSafeMode() === false) {
    fetchCount++;
    console.log(`fetch ${fetchCount}`);
    return await fetch(...arguments);
  } else {
    fetchCount++;
    if (fetchCount > MAX_FETCHES) {
      console.log(`NOT fetching ${fetchCount}`);
      return null;
    } else {
      console.log(`fetch ${fetchCount}`);
      return await fetch(...arguments);
    }
  }
}



export async function fetchGuarded2(urls, session) {
  console.log(urls);
  console.log(session);
  if (getSafeMode() === false) {
    fetchCount++;
    console.log(`fetch ${fetchCount}`);
    return await fetch(urls,{
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
      },
    });
  } else {
    fetchCount++;
    if (fetchCount > MAX_FETCHES) {
      console.log(`NOT fetching ${fetchCount}`);
      return null;
    } else {
      console.log(`fetch ${fetchCount}`);
      return await fetch(urls,{
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
        },
      });
    }
  }
}