// type: PASSTHROUGH | amm_dex
// description: Created a deposit request of {TokenA | and TokenB} on Minswap

import { Account, Transaction } from "../../types/manifest";
import { joinWords, lucid } from "../../util/_";

// user script address with positive amounts and non-script address with negative amounts
// metadata { label:"674", json_metadata:{ msg:"Minswap: Deposit Order" } }
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

  const [, depositCurrencies] = weights[0];

  if (depositCurrencies?.length) {
    const description = `Created a deposit request of ${joinWords(depositCurrencies)} on Minswap`;
    const type = intermediaryTx.type === `${undefined}` ? "amm_dex" : intermediaryTx.type;

    const score = weights.reduce(
      (sum, [weight]) => sum + weight,
      0,
    );

    return { type, description, score };
  } else {
    return {
      type: intermediaryTx.type,
      description: intermediaryTx.description,
      score: 0,
    };
  }
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
          const maybeLP = currency.endsWith(" LP");
          if (maybeLP || amount < 0) continue; // skip LP Tokens or negative amounts
          scriptTotal[currency] = (scriptTotal[currency] ?? 0) + amount;
        }
      } else {
        for (const { currency, amount } of account.total) {
          const maybeLP = currency.endsWith(" LP");
          if (maybeLP || amount > 0) continue; // skip LP Tokens or positive amounts
          nonScriptTotal[currency] = (nonScriptTotal[currency] ?? 0) + amount;
        }
      }
    } catch {
      continue;
    }
  }

  const depositCurrencies = Object.keys(scriptTotal);
  const scriptTotalLength = depositCurrencies.length;
  const nonScriptTotalLength = Object.keys(nonScriptTotal).length;
  if (scriptTotalLength > 2) delete scriptTotal.ADA;
  return [scriptTotalLength && nonScriptTotalLength ? weighting.userAccounts : 0, depositCurrencies];
}

/**
 * There should be metadata with msg:"Minswap: Deposit Order"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW2(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const minswapDepositOrderCount = metadata.filter(
    ({ label, json_metadata }) => {
      const message = json_metadata?.msg;
      return label === "674" && message && message.length && message[0] === "Minswap: Deposit Order";
    }
  ).length;
  return [weighting.metadata * minswapDepositOrderCount / metadata.length, undefined];
}
