// type: PASSTHROUGH | amm_dex
// description: Executed an order on Minswap

import { Account, Asset, Transaction } from "../../types/manifest";

// other.role there's a Minswap address
// no withdrawal
// metadata { label:"674", json_metadata:{ msg:"Minswap: ..." } }
const weighting = {
  otherAccounts: .50,
  withdrawal: .15,
  metadata: .35,
};

export async function score(
  intermediaryTx: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const weights = await Promise.all([
    calcW1(intermediaryTx.accounts.other),
    calcW2(intermediaryTx.withdrawal_amount),
    calcW3(intermediaryTx.metadata),
  ]);

  const description = "Executed an order on Minswap";
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
 * There should be a NonKeyAddress, if there's no other account then score:0
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(other: Account[]): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  const hasMinswap = other.find(
    ({ role }) =>
      role.includes("Minswap")
  );
  if (hasMinswap) return [weighting.otherAccounts, undefined];

  const hasScript = other.find(
    ({ role }) =>
      role === "Unknown Script"
  );
  if (hasScript) return [weighting.otherAccounts / 2, undefined];

  return [0, undefined];
}

/**
 * The user will never withdraw as a the transaction is executed by some batchers.
 * @param withdrawal Whether is there some withdrawals associated with the user address
 * @returns [Score, AdditionalData]
 */
async function calcW2(withdrawal?: Asset): Promise<Calculation> {
  return [withdrawal ? 0 : weighting.withdrawal, undefined];
}

/**
 * There could be metadata with msg:"Minswap: ..."
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const minswapOrderExecutedCount = metadata.filter(
    ({ label, json_metadata }) => {
      const message = json_metadata?.msg;
      return label === "674" && message && message.length && message[0].startsWith("Minswap");
    }
  ).length;
  return [weighting.metadata * minswapOrderExecutedCount / metadata.length, undefined];
}
