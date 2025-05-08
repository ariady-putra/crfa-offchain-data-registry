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

export async function paymentCredentialOf(address: string) {
  const key = `lucid.paymentCredentialOf(${address})`;
  const data = cache.get(key);
  if (data) return data;

  const { paymentCredentialOf } = await import("@lucid-evolution/lucid");
  const paymentCredential = paymentCredentialOf(address);

  cache.set(key, paymentCredential, 3600_000);
  return paymentCredential;
}

export async function stakeCredentialOf(rewardAddress: string) {
  const key = `lucid.stakeCredentialOf(${rewardAddress})`;
  const data = cache.get(key);
  if (data) return data;

  const { stakeCredentialOf } = await import("@lucid-evolution/lucid");
  const stakeCredential = stakeCredentialOf(rewardAddress);

  cache.set(key, stakeCredential, 3600_000);
  return stakeCredential;
}

export async function fromText(text: string) {
  const key = `lucid.fromText(${text})`;
  const data = cache.get(key);
  if (data) return data;

  const { fromText } = await import("@lucid-evolution/lucid");
  const hex = fromText(text);

  cache.set(key, hex, 3600_000);
  return hex;
}

export async function toText(hex: string) {
  const key = `lucid.toText(${hex})`;
  const data = cache.get(key);
  if (data) return data;

  const { toText } = await import("@lucid-evolution/lucid");
  const text = toText(hex);

  cache.set(key, text, 3600_000);
  return text;
}
