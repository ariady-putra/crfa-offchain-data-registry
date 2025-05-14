// type: yield_farming | PASSTHROUGH
// description: Harvested #.## {TokenName} from Wingriders

import { Account, Asset, Transaction } from "../../types/manifest";
import { joinWords } from "../../util/_";

// other.role there's a Wingriders Farm... with negative amount(s) NonLPtokens
// no withdrawal if ran through Wingriders UI
// no metadata if ran through Wingriders UI
const weighting = {
  otherAccounts: .80,
  withdrawal: .10,
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
    calcW1(intermediaryTx.accounts.other),
    calcW2(intermediaryTx.withdrawal_amount),
    calcW3(intermediaryTx.metadata),
  ]);

  const [, harvestedTokens] = weights[0];

  const description = harvestedTokens ? `Harvested ${joinWords(harvestedTokens)} from Wingriders` : intermediaryTx.description;
  const type = harvestedTokens ? "yield_farming" : intermediaryTx.type;

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
 * There should be a Wingriders Farm... with negative amount(s) NonLPtokens.
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(other: Account[]): Promise<Calculation> {
  const assets = other.reduce(
    (sum, { role, total }) => {
      if (role.startsWith("Wingriders Farm"))
        total.reduce(
          (sum, { currency, amount }) => {
            sum[currency] = (sum[currency] ?? 0) - amount;
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

  const harvestedTokens = currencies.filter(
    (currency) =>
      assets[currency] > 0 && !currency.includes("-LPT-")
  ).map(
    (currency) =>
      `${assets[currency]} ${currency}${currency.toLowerCase().endsWith("token") && assets[currency] > 1 ? "s" : ""}`
  );

  return [weighting.otherAccounts * harvestedTokens.length / currencies.length, harvestedTokens];
}

/**
 * No withdrawal if ran through Wingriders UI
 * @param withdrawal Whether is there some withdrawals associated with the user address
 * @returns [Score, AdditionalData]
 */
async function calcW2(withdrawal?: Asset): Promise<Calculation> {
  return [withdrawal ? 0 : weighting.withdrawal, undefined];
}

/**
 * There should be no metadata if ran through the Wingriders UI
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  return [metadata.length ? 0 : weighting.metadata, undefined];
}
