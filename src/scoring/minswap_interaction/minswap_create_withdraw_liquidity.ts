// type: PASSTHROUGH | amm_dex
// description: Created a withdraw {LP Tokens | liquidity} order on Minswap

import { Account, Transaction } from "../../types/manifest";
import { bf, lucid } from "../../util/_";

// user.total with positive asset100000000000000000000000000000000000044
// other.role there's a Minswap Yield Farming... with negative asset100000000000000000000000000000000000044
// metadata { label:"674", json_metadata:{ msg:"Minswap: ... Withdraw liquidity" } }
const weighting = {
  userAccounts: .10,
  otherAccounts: .40,
  metadata: .50,
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
    calcW2(intermediaryTx.accounts.other, txUTXOs),
    calcW3(intermediaryTx.metadata),
  ]);

  const [, qty] = weights[0];
  const [, farm] = weights[1];

  const description = `Created a withdraw ${qty && farm
    ? `${qty} LP Token${qty > 1 ? "s" : ""} from ${farm} farm`
    : "liquidity order"} on Minswap`;
  const type = qty && farm ? "yield_farming" : intermediaryTx.type;

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
 * There should be positive asset100000000000000000000000000000000000044.
 * @param user User Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(user: Account[]): Promise<Calculation> {
  const lpTokens = user.reduce(
    (sum, { total }) =>
      total.reduce(
        (sum, { currency, amount }) => {
          if ((currency.endsWith(" LP") || (currency.startsWith("asset") && currency.length === 44)) && amount > 0)
            sum += amount;
          return sum;
        },
        sum,
      ),
    0,
  );
  return [lpTokens ? weighting.userAccounts : 0, lpTokens];
}

/**
 * There should be a Minswap Yield Farming... with negative asset100000000000000000000000000000000000044,
 * if there's no other account then score:0
 * 
 * @param other Other Accounts
 * @param txUTXOs Blockfrost TransactionUTXOs
 * @returns [Score, AdditionalData]
 */
async function calcW2(
  other: Account[],
  txUTXOs: Record<string, any>,
): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  const yieldFarming = other.find(
    ({ role, total }) =>
      role.startsWith("Minswap Yield Farming") && total.find(
        ({ currency, amount }) =>
          (currency.endsWith(" LP") || (currency.startsWith("asset") && currency.length === 44)) && amount < 0
      )
  );
  if (!yieldFarming) return [0, undefined];

  let farmName: string | undefined = undefined;
  for (const { address } of other) {
    try {
      if (address === yieldFarming.address) {
        const { data_hash } = txUTXOs.inputs.find(
          (input: Record<string, any>) =>
            input.address === address
        );

        const { json_value } = await bf.getDatum(data_hash);
        farmName = await lucid.toText(json_value.fields[3].list[0].fields[0].fields[1].bytes);
        if (farmName) break;
      }
    } catch {
      continue;
    }
  }
  return [farmName ? weighting.otherAccounts : 0, farmName];
}

/**
 * There should be metadata with msg:"Minswap: ... Withdraw liquidity"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  let score = 0;

  const minswap = "Minswap";
  const withdraw = "Withdraw";
  const liquidity = "liquidity";

  for (const { label, json_metadata } of metadata) {
    try {
      if (label === "674") {
        for (const message of json_metadata?.msg) {
          if (message.startsWith(minswap)) {
            score += 10;
          } else if (message.toLowerCase().startsWith(minswap.toLowerCase())) {
            score += 5;
          } else if (message.includes(minswap)) {
            score += 2;
          } else if (message.toLowerCase().includes(minswap.toLowerCase())) {
            score += 1;
          }

          if (message.includes(withdraw)) {
            score += 10;
          } else if (message.toLowerCase().includes(withdraw.toLowerCase())) {
            score += 1;
          }

          if (message.endsWith(liquidity)) {
            score += 10;
          } else if (message.includes(liquidity)) {
            score += 2;
          }

          if (score) break;
        }
      }
    } catch {
      continue;
    }
  }

  return [weighting.metadata * score / 30, undefined];
}
