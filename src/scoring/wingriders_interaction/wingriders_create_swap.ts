// type: PASSTHROUGH | amm_dex
// description: Created a swap transaction on Wingriders

import { Account, Transaction } from "../../types/manifest";
import { lucid } from "../../util/_";

// user script address with positive amounts and non-script address with negative amounts
// metadata { label:"674", json_metadata:{ msg:"WingRiders: ... Swap" } }
const weighting = {
  userAccounts: .75,
  metadata: .25,
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
    calcW2(intermediaryTx.metadata),
  ]);

  const description = "Created a swap transaction on Wingriders";
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
 * There must be a user script address with positive NonLP amounts,
 * and a non-script address with negative NonLP amounts.
 * 
 * @param user User Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(user: Account[]): Promise<Calculation> {
  const scriptTotal: Record<string, number> = {};
  const nonScriptTotal: Record<string, number> = {};

  for (const account of user) {
    try {
      const { paymentCredential, stakeCredential } = await lucid.getAddressDetails(account.address);
      if (paymentCredential?.type === "Script" || stakeCredential?.type === "Script") {
        for (const { currency, amount } of account.total) {
          const maybeLP = currency.includes("-LPT-");
          if (maybeLP || amount < 0) continue; // skip LP Tokens or negative amounts
          scriptTotal[currency] = (scriptTotal[currency] ?? 0) + amount;
        }
      } else {
        for (const { currency, amount } of account.total) {
          const maybeLP = currency.includes("-LPT-");
          if (maybeLP || amount > 0) continue; // skip LP Tokens or positive amounts
          nonScriptTotal[currency] = (nonScriptTotal[currency] ?? 0) + amount;
        }
      }
    } catch {
      continue;
    }
  }

  return [Object.keys(scriptTotal).length && Object.keys(nonScriptTotal).length ? weighting.userAccounts : 0, undefined];
}

/**
 * There should be metadata with msg:"WingRiders: ... Swap"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW2(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  let score = 0;

  const wingriders = "WingRiders";
  const swap = "Swap";

  for (const { label, json_metadata } of metadata) {
    try {
      if (label === "674") {
        for (const message of json_metadata?.msg) {
          if (message.startsWith(wingriders)) {
            score += 10;
          } else if (message.toLowerCase().startsWith(wingriders.toLowerCase())) {
            score += 5;
          } else if (message.includes(wingriders)) {
            score += 2;
          } else if (message.toLowerCase().includes(wingriders.toLowerCase())) {
            score += 1;
          }

          if (message.endsWith(swap)) {
            score += 10;
          } else if (message.toLowerCase().endsWith(swap.toLowerCase())) {
            score += 5;
          } else if (message.includes(swap)) {
            score += 2;
          } else if (message.toLowerCase().includes(swap.toLowerCase())) {
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
