// type: stake_delegation
// description: Delegated stake to pool: {[TICKER] PoolName | PoolName} | Stake Delegation

import { Account, Asset, Transaction } from "../../types/manifest";
import { bf, lucid } from "../../util/_";

// txInfo.delegation_count > 0
// user.total.length === 1 (currency:ADA,amount:-#.##)
// other.role.length === 0
// no withdrawal
// no metadata
const weighting = {
  stakeDelegation: .50,
  userAccounts: .25,
  otherAccounts: .15,
  withdrawal: .05,
  metadata: .05,
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
    calcW3(withdrawal_amount),
    calcW4(metadata),
  ]);

  const [, poolMetadata] = weights[0];
  const poolTicker =
    poolMetadata?.ticker
      ? `[${poolMetadata.ticker}]`
      : undefined;
  const poolName =
    poolMetadata?.name
      ? (poolTicker ?
        `${poolTicker} ${poolMetadata.name}`
        : poolMetadata.name)
      : undefined;
  const description = poolName ? `Delegated stake to pool: ${poolName}` : "Stake Delegation";
  const type = "stake_delegation";

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
 * Delegation count must be greater than 0. There may or may not be stake certs.
 * @param txInfo Blockfrost TxInfo
 * @param stakeAddress The User Bech32 StakeAddress
 */
async function calcW0(txInfo: Record<string, any>, stakeAddress?: string): Promise<Calculation> {
  if (!stakeAddress) return [0, undefined];

  try {
    if (txInfo.delegation_count) {
      const delegations = await bf.getTransactionDelegations(txInfo.hash);
      for (const { address, pool_id } of delegations) {
        const sk = await lucid.stakeCredentialOf(address);
        if (sk?.hash === stakeAddress) {
          const poolMetadata = await bf.getPoolMetadata(pool_id);
          return [weighting.stakeDelegation, poolMetadata];
        }
      }
    }
    return [weighting.stakeDelegation / 2, undefined]; // has delegation_count, but somehow failed to get pool metadata
  } catch {
    return [0, undefined];
  }
}

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
  if (!currencies.length || assets.ADA > 0) return [0, undefined];

  const adaCount = currencies.filter((currency) => currency === "ADA").length;
  return [weighting.userAccounts * adaCount / currencies.length, undefined];
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
 * Usually no withdrawal, especially if this is the initial stake delegation.
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
