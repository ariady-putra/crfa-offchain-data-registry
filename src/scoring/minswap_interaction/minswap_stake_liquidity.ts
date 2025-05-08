// type: yield_farming | PASSTHROUGH
// description: Staked {TokenName | liquidity} on Minswap

import { Account, Asset, Transaction } from "../../types/manifest";
import { bf, lucid } from "../../util/_";

// user.total with negative asset100000000000000000000000000000000000044
// other.role there's a Minswap Yield Farming... with positive asset100000000000000000000000000000000000044
// metadata { label:"674", json_metadata:{ msg:"Minswap: .. Stake liquidity" } }
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

  const [, tokenName] = weights[1];

  const description = `Staked ${tokenName ?? "liquidity"} on Minswap`;
  const type = tokenName ? "yield_farming" : intermediaryTx.type;

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
 * There should be an asset100000000000000000000000000000000000044 with negative amount.
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

  delete assets.ADA;

  const currencies = Object.keys(assets);
  return [weighting.userAccounts * currencies.filter(
    (currency) =>
      currency.startsWith("asset") && currency.length === 44 && assets[currency] < 0
  ).length / currencies.length, undefined];
}

/**
 * There should be a Minswap Yield Farming... with positive asset100000000000000000000000000000000000044,
 * if there's no other account then score:0
 * 
 * The Minswap Yield Farming contains the token name information in the output datum.
 * 
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(
  other: Account[],
  txUTXOs: Record<string, any>,
): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  let stakedToken: string | undefined = undefined;
  for (const { address, role } of other) {
    try {
      if (role.startsWith("Minswap Yield Farming")) {
        const { data_hash } = txUTXOs.outputs.find(
          (input: Record<string, any>) =>
            input.address === address
        );

        const { json_value } = await bf.getDatum(data_hash);
        stakedToken = await lucid.toText(json_value.fields[3].list[0].fields[0].fields[1].bytes);
        if (stakedToken) break;
      }
    } catch {
      continue;
    }
  }

  return [stakedToken ? weighting.otherAccounts : 0, stakedToken];
}

/**
 * There could be metadata with msg:"Minswap: .. Stake liquidity"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  let score = 0;

  const minswap = "Minswap";
  const stakeLiquidity = "Stake liquidity";

  for (const { label, json_metadata } of metadata) {
    try {
      if (label === "674") {
        for (const message of json_metadata?.msg) {
          if (message.startsWith(minswap)) {
            score += 10;
          } else if (message.toLowerCase().startsWith(minswap.toLowerCase())) {
            score += 5;
          } else if (message.includes(minswap)) {
            score += 2;
          } else if (message.toLowerCase().includes(minswap.toLowerCase())) {
            score += 1;
          }

          if (message.endsWith(stakeLiquidity)) {
            score += 10;
          } else if (message.toLowerCase().endsWith(stakeLiquidity.toLowerCase())) {
            score += 5;
          } else if (message.includes(stakeLiquidity)) {
            score += 2;
          } else if (message.toLowerCase().includes(stakeLiquidity.toLowerCase())) {
            score += 1;
          }

          if (score) break;
        }
      }
    } catch {
      continue;
    }
  }

  return [weighting.metadata * score / 20, undefined];
}
