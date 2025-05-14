// type: PASSTHROUGH | amm_dex
// description: Withdrew {#.## TokenA | and #.## TokenB} from XXX-YYY pool on Minswap

import { Account, Asset, Transaction } from "../../types/manifest";
import { joinWords, lucid } from "../../util/_";

// user script address with negative LPs and non-script address with positive amounts
// no withdrawal
// metadata { label:"674", json_metadata:{ msg:"Minswap: Order Executed" } }
const weighting = {
  userAccounts: .60,
  withdrawal: .30,
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
    calcW2(intermediaryTx.withdrawal_amount),
    calcW3(intermediaryTx.metadata),
  ]);

  const [, receivedTokensFromLP] = weights[0];

  if (receivedTokensFromLP?.length === 2) {
    const [receivedTokens, fromLP] = receivedTokensFromLP;

    const withdrewTokens = Object.keys(receivedTokens)
      .map(
        (currency) =>
          `${receivedTokens[currency] - (currency === "ADA" ? 2 : 0)} ${currency}${currency
            .toLowerCase().endsWith("token") && receivedTokens[currency] > 1
            ? "s" : ""
          }`
      );

    const description = `Withdrew ${joinWords(withdrewTokens)} from ${fromLP.slice(0, fromLP.length - 3)} pool on Minswap`;
    const type = intermediaryTx.type === `${undefined}` ? "amm_dex" : intermediaryTx.type;

    const score = weights.reduce(
      (sum, [weight]) => sum + weight,
      0,
    );

    return { type, description, score };
  } else {
    return {
      type: intermediaryTx.type,
      description: intermediaryTx.description,
      score: 0,
    };
  }
}

type Score = number;
type AdditionalData = any;
type Calculation = [Score, AdditionalData];

/**
 * There must be a user script address with negative LP amounts,
 * and a non-script address with positive amounts.
 * 
 * @param user User Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(user: Account[]): Promise<Calculation> {
  const scriptTotal: Record<string, number> = {};
  const nonScriptTotal: Record<string, number> = {};

  for (const account of user) {
    try {
      const { paymentCredential, stakeCredential } = await lucid.getAddressDetails(account.address);
      if (paymentCredential?.type === "Script" || stakeCredential?.type === "Script") {
        for (const { currency, amount } of account.total) {
          const nonLP = !currency.endsWith(" LP");
          if (nonLP || amount > 0) continue; // skip NonLP Tokens or positive amounts
          scriptTotal[currency] = (scriptTotal[currency] ?? 0) + amount;
        }
      } else {
        for (const { currency, amount } of account.total) {
          const maybeLP = currency.endsWith(" LP");
          if (maybeLP || amount < 0) continue; // skip LP Tokens or negative amounts
          nonScriptTotal[currency] = (nonScriptTotal[currency] ?? 0) + amount;
        }
      }
    } catch {
      continue;
    }
  }

  const lpTokens = Object.keys(scriptTotal);
  if (lpTokens.length !== 1) return [0, undefined];
  const [lpToken] = lpTokens;

  return [Object.keys(nonScriptTotal).length ? weighting.userAccounts : 0, [nonScriptTotal, lpToken]];
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
 * There should be metadata with msg:"Minswap: Order Executed"
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW3(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  const minswapOrderExecuted = metadata.filter(
    ({ label, json_metadata }) => {
      return label === "674" && json_metadata?.msg?.find(
        (message: string) =>
          message === "Minswap: Order Executed"
      );
    }
  );
  return [weighting.metadata * minswapOrderExecuted.length / metadata.length, undefined];
}
