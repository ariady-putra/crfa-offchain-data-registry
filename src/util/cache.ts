// TODO: Use a proper caching system!
const cache: Record<string, { data: any, exp: number; }> = {};
const deleteStaleData =
  async (now: number) =>
    Object.keys(cache).forEach(
      (key) => {
        if (now > cache[key].exp) {
          delete cache[key];
        }
      }
    );

export function get(key: string) {
  let data = undefined;
  const now = new Date().getTime();
  if (now < cache[key]?.exp) {
    data = cache[key].data;
  }
  deleteStaleData(now); // async
  return data;
}

export function set(key: string, data: any, timeout: number) {
  const now = new Date().getTime();
  cache[key] = { data, exp: now + timeout };
  deleteStaleData(now); // async
}
