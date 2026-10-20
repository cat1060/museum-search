// The Art Institute of Chicago asks API clients to identify themselves.
export const CLIENT_NAME = "museum-search (https://github.com/cat1060/museum-search)";

export async function getJson(url, headers = {}, timeout = 15000) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    const err = new Error(`${new URL(url).host} returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Fetch many URLs, a few at a time, retrying each once. Returns the ones that succeed, in order.
// Some museum servers stall when too many requests arrive at once.
export async function getAll(urls, headers, concurrency = 4) {
  const results = new Array(urls.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      for (let attempt = 0; attempt < 2 && results[i] === null; attempt++) {
        try {
          results[i] = await getJson(urls[i], headers, 6000);
        } catch {
          // Try once more, then give up on this one.
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results.filter(Boolean);
}
