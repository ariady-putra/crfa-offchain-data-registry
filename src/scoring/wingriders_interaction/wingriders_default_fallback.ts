// type: PASSTHROUGH | amm_dex
// description: Executed an order on Wingriders

import { Account, Asset, Transaction } from "../../types/manifest";

// other.role there's a Wingriders address
// metadata contains WingRiders
const weighting = {
  otherAccounts: .65,
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
    calcW2(intermediaryTx.metadata),
  ]);

  const description = "Executed an order on Wingriders";
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

  const hasWingriders = other.find(
    ({ role }) =>
      role.toUpperCase().includes("WINGRIDERS")
  );
  if (hasWingriders) return [weighting.otherAccounts, undefined];

  const hasScript = other.find(
    ({ role }) =>
      role === "Unknown Script"
  );
  if (hasScript) return [weighting.otherAccounts / 2, undefined];

  return [0, undefined];
}

/**
 * There could be metadata that contains WingRiders
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW2(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const wingriders = metadata.filter(
    ({ label, json_metadata }) => {
      return label === "674" && json_metadata?.msg?.find(
        (message: string) =>
          message.toUpperCase().includes("WINGRIDERS")
      );
    }
  );
  return [weighting.metadata * wingriders.length / metadata.length, undefined];
}
