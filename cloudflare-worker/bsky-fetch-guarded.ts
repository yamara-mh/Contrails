export let fetchCount = 0;
let SAFE_MODE = true;
const MAX_FETCHES = 50;

export function resetFetchCount() {
  fetchCount = 0;
}

export function setSafeMode(safeMode) {
  SAFE_MODE = safeMode;
}

function getSafeMode() {
  return SAFE_MODE;
}

export async function fetchGuarded(url: string, init: { body: string; method: string; headers: any }) {
  if (getSafeMode() === false) {
    fetchCount++;
    return await fetch(url, init);
  } else {
    fetchCount++;
    if (fetchCount > MAX_FETCHES) {
      console.log(`NOT fetching ${fetchCount}`);
      return null;
    } else {
      return await fetch(url, init);
    }
  }
}