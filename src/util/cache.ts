// TODO: Use a proper caching system!
const cache: Record<string, { data: any, exp: number; }> = {};

async function deleteStaleData() {
  const now = new Date().getTime();
  Object.keys(cache).forEach((key) => {
    if (cache[key].exp < now) {
      delete cache[key];
    }
  });
}

export function get(key: string) {
  if (cache[key]?.exp > new Date().getTime()) {
    return cache[key].data;
  }
  deleteStaleData();
}

export function set(key: string, data: any, timeout: number) {
  cache[key] = { data, exp: new Date().getTime() + timeout };
  deleteStaleData();
}
