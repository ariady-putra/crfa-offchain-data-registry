// type: PASSTHROUGH | amm_dex
// description: Withdrew #.## TokenA and #.## TokenB from XXX-YYY LP on Minswap

import { Account, Asset, Transaction } from "../../types/manifest";

// user.total 1 or more NonADA with positive amount
// other.role there's a Minswap Liquidity Pool with positive LP Token amount
// no withdrawal
// metadata { label:"674", json_metadata:{ msg:"Minswap: Order Executed" } }
const weighting = {
  userAccounts: .30,
  otherAccounts: .40,
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
    calcW2(intermediaryTx.accounts.other),
    calcW3(intermediaryTx.withdrawal_amount),
    calcW4(intermediaryTx.metadata),
  ]);

  const [, [lToken, rToken]] = weights[0];
  const [, currencyLP] = weights[1];

  const description = `Withdrew ${lToken} and ${rToken} from ${currencyLP} on Minswap`;
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
 * There should be 2 or 3 tokens with 1 or more non-ADA token with positive amount.
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
  switch (currencies.length) {
    case 3: delete assets.ADA; // let it fall through
    case 2: return [
      weighting.userAccounts, [
        `${assets[currencies[0]] - (currencies[0] === "ADA" ? 2 : 0)} ${currencies[0]}`,
        `${assets[currencies[1]] - (currencies[1] === "ADA" ? 2 : 0)} ${currencies[1]}`,
      ],
    ];

    default: return [0, [undefined, undefined]];
  }
}

/**
 * There should be a Minswap Liquidity Pool with positive LP Token,
 * if there's no other account then score:0
 * 
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  let score = 0;

  let minswapLiquidityPool = other.find(
    ({ role }) =>
      role === "Minswap Liquidity Pool"
  );
  if (minswapLiquidityPool) score += 5; // Minswap Liquidity Pool found
  else {
    minswapLiquidityPool = other.find(
      ({ role }) =>
        role === "Unknown Script"
    );
    if (minswapLiquidityPool) score += 1; // Unknown Script found instead
  }

  const lpToken = minswapLiquidityPool?.total.find(
    ({ currency }) =>
      currency.endsWith(" LP")
  );
  if (lpToken) score += 2; // found LP Token

  return [weighting.otherAccounts * score / 7, lpToken?.currency];
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
