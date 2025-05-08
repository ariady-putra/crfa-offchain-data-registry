// type: PASSTHROUGH | amm_dex
// description: Swapped #.## TokenA for #.## TokenB on Minswap

import { Account, Asset, Transaction } from "../../types/manifest";
import { bf } from "../../util/_";

// user.total with positive amount
// other.role there's a NonKeyAddress with only negative ADA
// no withdrawal
// metadata { label:"674", json_metadata:{ msg:"Minswap: Order Executed" } }
const weighting = {
  userAccounts: .40,
  otherAccounts: .30,
  withdrawal: .20,
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
    calcW2(intermediaryTx.accounts.other, txUTXOs, lucidAddressDetails),
    calcW3(intermediaryTx.withdrawal_amount),
    calcW4(intermediaryTx.metadata),
  ]);

  const [, toTokens] = weights[0];
  const [, paidLovelace] = weights[1];

  const forTokens = toTokens.map(({ currency, amount }: Asset) => `${amount} ${currency}`);
  let receiveTokens = "";
  switch (forTokens.length) {
    case 1:
      receiveTokens = forTokens[0];
      break;

    case 2:
      receiveTokens = `${forTokens[0]} and ${forTokens[1]}`;
      break;

    default: {
      const last = forTokens.length - 1;
      receiveTokens = `${forTokens.slice(0, last).join(", ")} and ${forTokens[last]}`;
      break;
    }
  }

  const paidADA = paidLovelace / 1_000000;

  const description = `Swapped ${paidADA} ADA for ${receiveTokens} on Minswap`;
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
 * Take NonADA as the bought token, otherwise the user sold some token for ADA.
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

  const positiveAmountCount = Object.values(assets).filter((amount) => amount > 0).length;
  const totalCount = Object.keys(assets).length;

  const ada = assets.ADA;
  const toAda: Array<Asset> = [{ currency: "ADA", amount: ada }]; // maybe the user sold their tokens for ADA instead

  delete assets.ADA;

  const others = assets;
  const toOtherTokens: Array<Asset> = Object.keys(others).map(
    (currency) => {
      return {
        currency,
        amount: assets[currency]
      };
    }); // the user swapped for these tokens

  return [weighting.userAccounts * positiveAmountCount / totalCount, toOtherTokens.length ? toOtherTokens : toAda];
}

/**
 * There should be at least a NonKeyAddress with only negative ADA,
 * if there's no other account then score:0
 * 
 * That NonKeyAddress must be in the UTxO Inputs with some data_hash.
 * The underlying datum must contain the user address' PKH.
 * It also contains how much ADA paid by the user.
 * 
 * @param other Other Accounts
 * @param txUTXOs Blockfrost Transaction UTXOs
 * @returns [Score, AdditionalData]
 */
async function calcW2(
  other: Account[],
  txUTXOs: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  let paidLovelace = 0;
  for (const { address, role, total } of other) {
    try {
      const maybeMinswapScriptAddress = role === "Unknown Script" &&
        total.length === 1 && total[0].currency === "ADA" && total[0].amount < 0;
      if (!maybeMinswapScriptAddress) continue;

      const { data_hash } = txUTXOs.inputs.find(
        (input: Record<string, any>) =>
          input.address === address
      );

      const { json_value } = await bf.getDatum(data_hash);
      if (json_value.fields[0].fields[0].bytes !== lucidAddressDetails.paymentCredential?.hash) continue;
      paidLovelace += json_value.fields[6].fields[1].fields[0].int;
    }
    catch {
      continue;
    }
  }
  return [paidLovelace ? weighting.otherAccounts : 0, paidLovelace];
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
 * There could be metadata with msg:"Minswap: Order Executed"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW4(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const minswapOrderExecutedCount = metadata.filter(
    ({ label, json_metadata }) => {
      const message = json_metadata?.msg;
      return label === "674" && message && message.length && message[0] === "Minswap: Order Executed";
    }
  ).length;
  return [weighting.metadata * minswapOrderExecutedCount / metadata.length, undefined];
}
