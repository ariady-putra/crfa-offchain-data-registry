// type: multi_stake_delegation
// description: Delegated stake to multiple pools

import { Account, Transaction } from "../../types/manifest";

// txInfo.delegation_count > 1
// user.total currency:ADA amount:-#.##
// other.role.length === 0
// metadata label:6862
const weighting = {
  stakeDelegation: .50,
  userAccounts: .15,
  otherAccounts: .10,
  metadata: .25,
};

export async function score(
  { accounts, metadata, withdrawal_amount }: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const weights = await Promise.all([
    calcW0(txInfo, lucidAddressDetails.stakeCredential?.hash),
    calcW1(accounts.user),
    calcW2(accounts.other),
    calcW3(metadata, txInfo),
  ]);

  const description = "Delegated stake to multiple pools";
  const type = "multi_stake_delegation";

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
 * Delegation count must be greater than 1
 * @param txInfo Blockfrost TxInfo
 * @param stakeAddress The User Bech32 StakeAddress
 */
async function calcW0(txInfo: Record<string, any>, stakeAddress?: string): Promise<Calculation> {
  return [stakeAddress && txInfo.delegation_count > 1 ? weighting.stakeDelegation : 0, undefined];
}

/**
 * There may be more than 1 associated addresses, but the AGGREGATE movement should only be ADA.
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
  if (!currencies.length || assets.ADA > 0) return [0, undefined];

  const adaCount = currencies.filter(
    (currency) =>
      currency === "ADA"
  ).length;

  const withMovement = currencies.filter(
    (currency) =>
      assets[currency]
  ).length;

  return [weighting.userAccounts * adaCount / withMovement, undefined];
}

/**
 * Usually no other accounts, unless the address has other associated addresses.
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  return [other.length ? 0 : weighting.otherAccounts, undefined];
}

/**
 * label:6862 with multiple pools.
 * @param metadata Transaction Metadata
 * @param txInfo Blockfrost TxInfo
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[], txInfo: Record<string, any>): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const label6862 = metadata.filter(
    ({ label }) =>
      label === "6862"
  );
  if (!label6862.length) return [0, undefined];

  const withPools = label6862.find(
    ({ json_metadata }) =>
      json_metadata?.pools?.length > 1
  );
  const poolCount = withPools?.json_metadata.pools.length ?? 0;
  if (!poolCount) return [0, undefined];

  const min = Math.min(poolCount, txInfo.delegation_count);
  const max = Math.max(poolCount, txInfo.delegation_count);
  if (!max) return [0, undefined];

  return [weighting.metadata * min / max / label6862.length, undefined];
}
