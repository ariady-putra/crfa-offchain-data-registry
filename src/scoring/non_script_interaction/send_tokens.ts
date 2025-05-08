// type: send_tokens
// description: Sent #.## TokenA, #.## TokenB and #.## TokenC

import { Account, Asset, Transaction } from "../../types/manifest";

// user.total with negative amounts
// other.role are Unknown Addresses
// no metadata
const weighting = {
  userAccounts: .45,
  otherAccounts: .45,
  metadata: .10,
};

export async function score(
  { accounts, metadata, network_fee }: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const weights = await Promise.all([
    calcW1(accounts.user),
    calcW2(accounts.other),
    calcW3(metadata),
  ]);

  const totalTokens: Record<string, number> = {
    [network_fee.currency]: network_fee.amount,
  };

  const [, inputTokens] = weights[0];
  const [, outputTokens] = weights[1];

  Object.keys(inputTokens).forEach(
    (currency) => {
      if (currency === "ADA")
        totalTokens[currency] = (totalTokens[currency] ?? 0) + inputTokens[currency];
      else
        totalTokens[currency] = (totalTokens[currency] ?? 0) - inputTokens[currency];
    });
  Object.keys(outputTokens).forEach(
    (currency) => {
      if (currency === "ADA")
        totalTokens[currency] = (totalTokens[currency] ?? 0) + outputTokens[currency];
    });

  const sendTokens = Object.keys(totalTokens)
    .filter((currency) => totalTokens[currency])
    .map((currency) => `${totalTokens[currency]} ${currency}${totalTokens[currency] > 1 ? "s" : ""}`);

  let sentTokens = "Sent";
  for (let i = 0; i < sendTokens.length; i++) {
    sentTokens += ` ${sendTokens[i]}`;
    if (i < sendTokens.length - 2) sentTokens += ",";
    if (i < sendTokens.length - 1) sentTokens += " and";
  }
  const description = sentTokens;
  const type = "sent_tokens";

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
 * Input amounts should be negative.
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

  const negativesCount = amounts.filter((amount) => amount < 0).length;
  return [amounts.length > 1 // to differentiate with send_ada
    ? weighting.userAccounts * negativesCount / amounts.length
    : 0, assets];
}

/**
 * Output amounts should be positive.
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

  const amounts = Object.values(assets);
  if (!amounts.length) return [0, assets];

  const positivesCount = amounts.filter((amount) => amount > 0).length;
  return [amounts.length > 1 // to differentiate with send_ada
    ? weighting.otherAccounts * positivesCount / amounts.length
    : 0, assets];
}

/**
 * The user can optionally put some arbitrary metadata though.
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  return [metadata.length ? 0 : weighting.metadata, undefined];
}
