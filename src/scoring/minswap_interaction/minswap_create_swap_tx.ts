// type: PASSTHROUGH | amm_dex
// description: Created a swap transaction on Minswap

import { Account, Transaction } from "../../types/manifest";
import { bf } from "../../util/_";

// user.total with negative amount
// other.role are NonKeyAddresses with positive amounts
// metadata { label:"674", json_metadata:{ msg:"Minswap: Market Order" } }
const weighting = {
  userAccounts: .40,
  otherAccounts: .50,
  metadata: .10,
};

export async function score(
  intermediaryTx: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const weights = await Promise.all([
    calcW1(intermediaryTx.accounts.user),
    calcW2(intermediaryTx.accounts.other, txUTXOs),
    calcW3(intermediaryTx.metadata),
  ]);

  const description = "Created a swap transaction on Minswap";
  const type = intermediaryTx.type === `${undefined}` ? "amm_dex" : intermediaryTx.type;

  const score = weights.reduce(
    (sum, [weight]) => sum + weight,
    0,
  );

  return { type, description, score };
}

type Score = number;
type AdditionalData = any;
type Calculation = [Score, AdditionalData];

/**
 * The user must pay something to create a transaction, so the total amount must be negative, be it ADA or NonLP tokens.
 * @param user User Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(user: Account[]): Promise<Calculation> {
  const assets = user.reduce(
    (sum, { total }) => {
      total.reduce(
        (sum, { currency, amount }) => {
          sum[currency] = (sum[currency] ?? 0) + amount;
          return sum;
        },
        sum,
      );
      return sum;
    },
    {} as Record<string, number>,
  );

  const currencies = Object.keys(assets);
  if (!currencies.length) return [0, undefined];

  const payCount = currencies.filter(
    (currency) =>
      !currency.endsWith(" LP") && // not LP Tokens
      assets[currency] < 0
  ).length;
  return [weighting.userAccounts * payCount / currencies.length, undefined];
}

/**
 * NonKeyAddress count with positive amounts / other accounts length, if there's no other account then score:0
 * @param other Other Accounts
 * @param txUTXOs Blockfrost Transaction UTXOs
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[], txUTXOs: Record<string, any>): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  let paidMinswapAddressCount = 0;
  for (const { address, role, total } of other) {
    try {
      if (role === "Minswap Batch Order") {
        paidMinswapAddressCount += 1;
        continue;
      }

      const maybeMinswapScriptAddress = role === "Unknown Script" && total.every(({ amount }) => amount > 0);
      if (!maybeMinswapScriptAddress) continue;

      const { data_hash } = txUTXOs.outputs.find(
        (output: Record<string, any>) =>
          output.address === address
      );

      const { json_value } = await bf.getDatum(data_hash);
      const paidAmount = json_value.fields[6].fields[1].fields[0].int;
      if (paidAmount) paidMinswapAddressCount += 1;
    }
    catch {
      continue;
    }
  }
  return [weighting.otherAccounts * paidMinswapAddressCount / other.length, undefined];
}

/**
 * There could be metadata with msg:"Minswap: Market Order"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const minswapMarketOrderCount = metadata.filter(
    ({ label, json_metadata }) => {
      const message = json_metadata?.msg;
      return label === "674" && message && message.length && message[0] === "Minswap: Market Order";
    }
  ).length;
  return [weighting.metadata * minswapMarketOrderCount / metadata.length, undefined];
}
