// type: self_transaction
// description: Self Transaction

import { Account, Transaction } from "../../types/manifest";

// user.total.length
// other.role.length === 0
const weighting = {
  userAccounts: .50,
  otherAccounts: .50,
};
export async function score(
  { accounts }: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const weights = await Promise.all([
    calcW1(accounts.user),
    calcW2(accounts.other),
  ]);

  const description = "Self Transaction";
  const type = "self_transaction";

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
 * Has at least a user account.
 * @param user User Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW1(user: Account[]): Promise<Calculation> {
  return [user.length ? weighting.userAccounts : 0, undefined];
}

/**
 * Has no other accounts.
 * @param other Other Accounts
 * @returns [Score, AdditionalData]
 */
async function calcW2(other: Account[]): Promise<Calculation> {
  return [other.length ? 0 : weighting.otherAccounts, undefined];
}
