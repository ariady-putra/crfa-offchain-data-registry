import { cache } from "./_";

export async function getAddressDetails(address: string) {
  const key = `lucid.getAddressDetails(${address})`;
  const data = cache.get(key);
  if (data) return data;

  const { getAddressDetails } = await import("@lucid-evolution/lucid");
  const addressDetails = getAddressDetails(address);

  cache.set(key, addressDetails, 3600_000);
  return addressDetails;
}
