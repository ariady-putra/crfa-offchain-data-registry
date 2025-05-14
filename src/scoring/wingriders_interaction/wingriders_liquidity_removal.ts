// type: PASSTHROUGH | amm_dex
// description: Withdrew #.## TokenA and #.## TokenB from XXX-YYY LP on Wingriders

import { Account, Asset, Transaction } from "../../types/manifest";
import { joinWords } from "../../util/_";

// user.total 1 or more NonADA with positive amount
// other.role there's a Wingriders Request address with negative LPT amount that points to an Unknown Script which contains the withdrawal amounts
// no withdrawal
// no metadata
const weighting = {
  userAccounts: .10,
  otherAccounts: .80,
  withdrawal: .05,
  metadata: .05,
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
    calcW3(intermediaryTx.withdrawal_amount),
    calcW4(intermediaryTx.metadata),
  ]);

  const [, scTotal] = weights[1];

  if (scTotal?.length) {
    const tokens = scTotal.filter(
      ({ currency }: Asset) =>
        !currency.includes("-LPT-")
    ).map(
      ({ currency, amount }: Asset) =>
        `${-amount} ${currency}${currency.toLowerCase().endsWith("token") && -amount > 1 ? "s" : ""}`
    );

    const lps = scTotal.filter(
      ({ currency }: Asset) =>
        currency.includes("-LPT-")
    ).map(
      ({ currency }: Asset) =>
        currency.replace("WR-LPT-", "").replaceAll("/", "-")
    );

    const description = `Withdrew ${joinWords(tokens)} from ${joinWords(lps)} LP${lps.length > 1 ? "s" : ""} on Wingriders`;
    const type = intermediaryTx.type === `${undefined}` ? "amm_dex" : intermediaryTx.type;

    const score = weights.reduce(
      (sum, [weight]) => sum + weight,
      0,
    );

    return { type, description, score };
  }
  else {
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
 * There should be more than 1 token with positive amount.
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

  return [weighting.userAccounts * Math.min(Object.keys(assets)
    .filter(
      (currency) =>
        assets[currency] > 0
    ).length, 2) / 2, undefined];
}

/**
 * There should be a Wingriders Request address with negative LPT amount that points to an Unknown Script which contains the withdrawal amounts.
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  let score = 0;

  const wingridersRequestAddress = other.find(
    ({ role }) =>
      role === "Wingriders Request"
  );
  if (wingridersRequestAddress) score += 1;

  const lpt = wingridersRequestAddress?.total.find(
    ({ currency }) =>
      currency.includes("-LPT-")
  );
  if (lpt) score += 1;

  const wingridersScriptAddress = other.find(
    ({ role, total }) =>
      role !== "Unknown Address" && total.find(
        ({ currency, amount }) =>
          currency === lpt?.currency && -amount === lpt?.amount
      )
  );
  if (wingridersScriptAddress) score += 1;

  return [weighting.otherAccounts * score / 3, wingridersScriptAddress?.total];
}

/**
 * The user will never withdraw as a the transaction is executed by some batchers.
 * @param withdrawal Whether is there some withdrawals associated with the user address
 * @returns [Score, AdditionalData]
 */
async function calcW3(withdrawal?: Asset): Promise<Calculation> {
  return [withdrawal ? 0 : weighting.withdrawal, undefined];
}

/**
 * There should be no metadata.
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW4(metadata: Record<string, any>[]): Promise<Calculation> {
  return [metadata.length ? 0 : weighting.metadata, undefined];
}
