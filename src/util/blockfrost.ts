import { env } from "process";
import { cache } from "./_";

const { BF_PID, BF_URL } = env;

async function req(path: string) {
  const key = `bf.${path}`;
  const data = cache.get(key);
  if (data) return data;

  const resp = await fetch(`${BF_URL}${path}`, { headers: { project_id: `${BF_PID}` } });
  const json = await resp.json();

  cache.set(key, json, 60_000); // 1 minute stale
  return json;
}

export const getAddressTransactions = (address: string) =>
  req(`/addresses/${address}/transactions?order=desc`);

export const getTransactionUTXOs = (hash: string) =>
  req(`/txs/${hash}/utxos`);

export const getTransactionMetadata = (hash: string) =>
  req(`/txs/${hash}/metadata`);

export const getAssetInfo = (unit: string) =>
  req(`/assets/${unit}`);
