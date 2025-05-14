// type: send_ada
// description: Sent #.## ADA

import { Account, Asset, Transaction } from "../../types/manifest";

// user.total.length === 1 (currency:ADA,amount:-#.##)
// other.role are Unknown Addresses
// no metadata
const weighting = {
  userAccounts: .80,
  otherAccounts: .15,
  metadata: .05,
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

  const [, amount] = weights[0];
  const description = `Sent ${amount - network_fee.amount} ADA`;
  const type = "send_ada";

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
 * There may be more than 1 associated addresses, but the aggregate currency should only be ADA.
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
  if (!currencies.length || assets.ADA > 0) return [0, assets.ADA];

  const adaCount = currencies.filter((currency) => currency === "ADA").length;
  return [weighting.userAccounts * adaCount / currencies.length, -assets.ADA];
}

/**
 * Unknown Address count / other accounts length, if there's no other account then score:0
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  const nonScriptAddressCount = other.filter(({ role }) => role === "Unknown Address").length;
  return [weighting.otherAccounts * nonScriptAddressCount / other.length, undefined];
}

/**
 * The sender can optionally put some arbitrary metadata though.
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  return [metadata.length ? 0 : weighting.metadata, undefined];
}
