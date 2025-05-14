// type: PASSTHROUGH | amm_dex
// description: Staked #.## MIN on Minswap

import { Account, Transaction } from "../../types/manifest";

// user.total with negative Minswap
// other.role there's a Minswap Min staking... with positive Minswap
// metadata { label:"674", json_metadata:{ msg:"Minswap: Stake MIN" } }
const weighting = {
  userAccounts: .40,
  otherAccounts: .10,
  metadata: .50,
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
    calcW2(intermediaryTx.accounts.other),
    calcW3(intermediaryTx.metadata),
  ]);

  const [, minswap] = weights[0];

  const description = `Staked ${minswap} MIN on Minswap`;
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
 * There should be a negative Minswap.
 * @param user User Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(user: Account[]): Promise<Calculation> {
  const minswap = user.reduce(
    (sum, { total }) =>
      total.reduce(
        (sum, { currency, amount }) => {
          if (currency === "Minswap")
            sum -= amount;
          return sum;
        },
        sum,
      ),
    0,
  );
  return [minswap > 0 ? weighting.userAccounts : 0, minswap];
}

/**
 * There should be a script or Minswap Min staking... with positive Minswap.
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  return [other.find(
    ({ role, total }) =>
      (role.toUpperCase().startsWith("MINSWAP MIN STAKING") || role === "Unknown Script")
      && total.find(
        ({ currency, amount }) =>
          currency === "Minswap" && amount > 0
      )
  ) ? weighting.otherAccounts : 0, undefined];
}

/**
 * There should be metadata with msg:"Minswap: Stake MIN"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  let score = 0;

  const minswap = "Minswap";
  const stake = "Stake";
  const min = "MIN";

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

          if (message.includes(stake)) {
            score += 2;
          } else if (message.toLowerCase().includes(stake.toLowerCase())) {
            score += 1;
          }

          if (message.includes(min)) {
            score += 2;
          } else if (message.toUpperCase().includes(min)) {
            score += 1;
          }

          if (score) break;
        }
      }
    } catch {
      continue;
    }
  }

  return [weighting.metadata * score / 14, undefined];
}
