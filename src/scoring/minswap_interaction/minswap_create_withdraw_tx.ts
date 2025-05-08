// type: PASSTHROUGH | amm_dex
// description: Created a withdraw XXX-YYY order on Minswap

import { Account, Transaction } from "../../types/manifest";

// user.total 2 currencies, ADA and Some LP, with negative amounts
// other.role is a NonKeyAddress with 2 currencies, ADA and Some LP, with positive amounts
// metadata { label:"674", json_metadata:{ msg:"Minswap: Withdraw Order" } }
const weighting = {
  userAccounts: .50,
  otherAccounts: .40,
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
    calcW2(intermediaryTx.accounts.other),
    calcW3(intermediaryTx.metadata),
  ]);

  const [, pairTokens] = weights[0];

  const description = `Created a withdraw ${pairTokens} order on Minswap`;
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
 * The user must pay ADA and Some LP, with negative amounts.
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

  const pairCount = currencies.filter(
    (currency) =>
      (currency.endsWith(" LP") && assets[currency] < 0) // LP Tokens must be negative
      || currency === "ADA"
  ).length;

  const pairTokens = currencies.find(
    (currency) => {
      return currency.endsWith(" LP") && assets[currency] < 0; // find negative LP Tokens
    });

  return [weighting.userAccounts * pairCount / currencies.length, pairTokens?.slice(0, pairTokens?.length - 3)];
}

/**
 * NonKeyAddress with ADA and Some LP, with positive amounts / other accounts length,
 * if there's no other account then score:0
 * 
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  let depositLpAddressCount = 0;
  for (const { role, total } of other) {
    const maybeMinswapScriptAddress =
      role !== "Unknown Address"
      && total.length === 2
      && total.every(
        ({ currency, amount }) =>
          (currency.endsWith(" LP") || currency === "ADA") &&
          amount > 0
      );
    if (maybeMinswapScriptAddress) depositLpAddressCount += 1;
  }
  return [weighting.otherAccounts * depositLpAddressCount / other.length, undefined];
}

/**
 * There could be metadata with msg:"Minswap: Withdraw Order"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const minswapWithdrawOrderCount = metadata.filter(
    ({ label, json_metadata }) => {
      const message = json_metadata?.msg;
      return label === "674" && message && message.length && message[0] === "Minswap: Withdraw Order";
    }
  ).length;
  return [weighting.metadata * minswapWithdrawOrderCount / metadata.length, undefined];
}
