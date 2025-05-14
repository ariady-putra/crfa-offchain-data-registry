// type: receive_tokens
// description: Received #.## TokenA, #.## TokenB and #.## TokenC

import { Account, Asset, Transaction } from "../../types/manifest";
import { joinWords } from "../../util/_";

// user.total with positive amounts
// other.role are Unknown Addresses
// no withdrawal
// no metadata
const weighting = {
  userAccounts: .40,
  otherAccounts: .30,
  withdrawal: .20,
  metadata: .10,
};

export async function score(
  { accounts, metadata, withdrawal_amount, network_fee }: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const weights = await Promise.all([
    calcW1(accounts.user),
    calcW2(accounts.other),
    calcW3(withdrawal_amount),
    calcW4(metadata),
  ]);

  const totalTokens: Record<string, number> = {
    // [network_fee.currency]: network_fee.amount,
  };

  const [, inputTokens] = weights[0];
  // const [, outputTokens] = weights[1];

  Object.keys(inputTokens).forEach(
    (currency) => {
      if (currency !== "ADA")
        totalTokens[currency] = (totalTokens[currency] ?? 0) + inputTokens[currency];
    });
  // Object.keys(outputTokens).forEach(
  //   (currency) => {
  //     if (currency === "ADA")
  //       totalTokens[currency] = (totalTokens[currency] ?? 0) + outputTokens[currency];
  //   });

  const receiveTokens = Object.keys(totalTokens)
    .filter(
      (currency) =>
        totalTokens[currency] > 0
    )
    .map(
      (currency) =>
        `${totalTokens[currency]} ${currency}${currency.toLowerCase().endsWith("token") && totalTokens[currency] > 1 ? "s" : ""}`
    );

  const description = `Received ${joinWords(receiveTokens)}`.trim();
  const type = "receive_tokens";

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
 * Input amounts should be positive.
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

  const amounts = Object.values(assets);
  if (!amounts.length) return [0, assets];

  const negativesCount = amounts.filter((amount) => amount > 0).length;
  return [amounts.length > 1 // to differentiate with receive_ada
    ? weighting.userAccounts * negativesCount / amounts.length
    : 0, assets];
}

/**
 * Output amounts should be negative.
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  const assets = other.reduce(
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

  // filter out ADA to differentiate with receive_ada
  const currencies = Object.keys(assets).filter((currency) => currency !== "ADA" && assets[currency]);
  if (!currencies.length) return [0, assets];

  const negativesCount = currencies.filter((currency) => assets[currency] < 0).length;
  return [weighting.otherAccounts * negativesCount / currencies.length, assets];
}

/**
 * It is impossible to withdraw as a beneficiary, the sender may withdraw their stake rewards but not the receivers.
 * @param withdrawal Whether is there some withdrawals associated with the user address
 * @returns [Score, AdditionalData]
 */
async function calcW3(withdrawal?: Asset): Promise<Calculation> {
  return [withdrawal ? 0 : weighting.withdrawal, undefined];
}

/**
 * The sender can optionally put some arbitrary metadata though.
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW4(metadata: Record<string, any>[]): Promise<Calculation> {
  return [metadata.length ? 0 : weighting.metadata, undefined];
}
