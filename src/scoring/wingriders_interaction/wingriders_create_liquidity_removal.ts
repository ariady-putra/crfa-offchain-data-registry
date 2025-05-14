// type: PASSTHROUGH | amm_dex
// description: Created a liquidity removal / XXX-YYY withdraw order on Wingriders

import { Account, Transaction } from "../../types/manifest";

// user.total 2 currencies, ADA and LPT, with negative amounts
// other.role is a Wingriders Address with 2 currencies, ADA and LPT, with positive amounts
// metadata { label:"674", json_metadata:{ msg:"WingRiders: ... Liquidity" } }
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
    calcW2(intermediaryTx.accounts.other),
    calcW3(intermediaryTx.metadata),
  ]);

  const [, pairTokens] = weights[0];

  const description = `Created a liquidity removal / ${pairTokens} withdraw order on Wingriders`;
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
      (currency.includes("-LPT-") && assets[currency] < 0) // LPT must be negative
      || currency === "ADA"
  ).length;

  const pairTokens = currencies.find(
    (currency) => {
      return currency.startsWith("WR-LPT") && assets[currency] < 0; // find negative WR-LPT
    });

  return [
    weighting.userAccounts * pairCount / currencies.length,
    pairTokens?.replace("WR-LPT-", "").replaceAll("/", "-"),
  ];
}

/**
 * Wingriders address with ADA and LPT, with positive amounts / other accounts length,
 * if there's no other account then score:0
 * 
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  let depositLptAddressCount = 0;
  for (const { role, total } of other) {
    const wingridersScriptAddress =
      role.startsWith("Wingriders")
      && total.length === 2
      && total.every(
        ({ currency, amount }) =>
          (currency.startsWith("WR-LPT") || currency === "ADA") &&
          amount > 0
      );
    if (wingridersScriptAddress) depositLptAddressCount += 1;
  }
  return [weighting.otherAccounts * depositLptAddressCount / other.length, undefined];
}

/**
 * There could be metadata with msg:"WingRiders: ... Liquidity"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const wingridersLiquidityRemovalOrderCount = metadata.filter(
    ({ label, json_metadata }) => {
      const message = json_metadata?.msg;
      return label === "674" && message && message.length &&
        message[0].toUpperCase().startsWith("WINGRIDERS") &&
        message[0].toLowerCase().endsWith("liquidity");
    }
  ).length;
  return [weighting.metadata * wingridersLiquidityRemovalOrderCount / metadata.length, undefined];
}
