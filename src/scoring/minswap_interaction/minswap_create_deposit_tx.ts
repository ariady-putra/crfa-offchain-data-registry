// type: PASSTHROUGH | amm_dex
// description: Created a deposit transaction on Minswap

import { Account, Transaction } from "../../types/manifest";

// user.total 2 or more currencies with negative amounts
// other.role is a NonKeyAddress with 2 or more currencies with positive amounts
// metadata { label:"674", json_metadata:{ msg:"Minswap: Deposit Order" } }
const weighting = {
  userAccounts: .45,
  otherAccounts: .45,
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
    calcW3(intermediaryTx.metadata),
  ]);

  const [, sendTokens] = weights[0];
  const [, receiveTokens] = weights[1];

  const depositTokens = [];
  for (const sendToken of sendTokens) {
    const intersecting = receiveTokens.includes(sendToken);
    if (intersecting) depositTokens.push(sendToken);
  }

  const description = `Created a deposit request of ${depositTokens.join(" - ")} on Minswap`;
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
 * The user must pay 2 or more currencies, with negative amounts.
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
  const depositTokens = currencies.filter((currency) => assets[currency] < 0);

  return [weighting.userAccounts * depositTokens.length / Math.min(currencies.length, 2), depositTokens];
}

/**
 * NonKeyAddress with 2 or more currencies with positive amounts / other accounts length,
 * if there's no other account then score:0
 * 
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  if (!other.length) return [0, undefined];

  const depositTokens: Record<string, number> = {};

  let depositTokensAddressCount = 0;
  for (const { role, total } of other) {
    const maybeMinswapScriptAddress =
      role !== "Unknown Address"
      && total.length >= 2
      && total.every(({ amount }) => amount > 0);
    if (maybeMinswapScriptAddress) {
      depositTokensAddressCount += 1;
      for (const { currency, amount } of total) {
        depositTokens[currency] = (depositTokens[currency] ?? 0) + amount;
      }
    }
  }

  return [weighting.otherAccounts * depositTokensAddressCount / other.length, Object.keys(depositTokens)];
}

/**
 * There could be metadata with msg:"Minswap: Deposit Order"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const minswapDepositOrderCount = metadata.filter(
    ({ label, json_metadata }) => {
      const message = json_metadata?.msg;
      return label === "674" && message && message.length && message[0] === "Minswap: Deposit Order";
    }
  ).length;
  return [weighting.metadata * minswapDepositOrderCount / metadata.length, undefined];
}
