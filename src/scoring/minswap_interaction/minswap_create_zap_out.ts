// type: PASSTHROUGH | amm_dex
// description: Created a zap-out order on Minswap

import { Account, Transaction } from "../../types/manifest";
import { lucid } from "../../util/_";

// user script address with positive asset1...44 and non-script address with negative asset1...44
// metadata { label:"674", json_metadata:{ msg:"Minswap: Zap Out ..." } }
const weighting = {
  userAccounts: .50,
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
    calcW2(intermediaryTx.metadata),
  ]);

  const description = "Created a zap-out order on Minswap";
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
 * There must be a user script address with positive asset1...44 amounts,
 * and a non-script address with negative asset1...44 amounts.
 * 
 * @param user User Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(user: Account[]): Promise<Calculation> {
  const scriptTotal: Record<string, number> = {};
  const nonScriptTotal: Record<string, number> = {};
  const lpTokens = new Set<string>();

  for (const account of user) {
    try {
      const { paymentCredential, stakeCredential } = await lucid.getAddressDetails(account.address);
      if (paymentCredential?.type === "Script" || stakeCredential?.type === "Script") {
        for (const { currency, amount } of account.total) {
          const nonLP = !(currency.endsWith(" LP") || (currency.startsWith("asset") && currency.length === 44));
          if (nonLP || amount < 0) continue; // skip NonLP Tokens or negative amounts
          scriptTotal[currency] = (scriptTotal[currency] ?? 0) + amount;
          lpTokens.add(currency);
        }
      } else {
        for (const { currency, amount } of account.total) {
          const nonLP = !(currency.endsWith(" LP") || (currency.startsWith("asset") && currency.length === 44));
          if (nonLP || amount > 0) continue; // skip NonLP Tokens or positive amounts
          nonScriptTotal[currency] = (nonScriptTotal[currency] ?? 0) + amount;
          lpTokens.add(currency);
        }
      }
    } catch {
      continue;
    }
  }

  if (!lpTokens.size) return [0, undefined];
  return [weighting.userAccounts, [...lpTokens.keys()][0].replaceAll("/", "-")];
}

/**
 * There could be metadata with msg:"Minswap: Zap Out ..."
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW2(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  let score = 0;

  const minswap = "Minswap";
  const zap = "Zap";
  const out = "Out";

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

          if (message.includes(zap)) {
            score += 2;
          } else if (message.toLowerCase().includes(zap.toLowerCase())) {
            score += 1;
          }

          if (message.includes(out)) {
            score += 2;
          } else if (message.toLowerCase().includes(out.toLowerCase())) {
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
