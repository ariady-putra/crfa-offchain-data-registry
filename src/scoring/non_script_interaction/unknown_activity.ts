// type: unknown_activity
// description: Unknown Activity

import { Transaction } from "../../types/manifest";

export async function score(
  {}: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  return {
    type: "unknown_activity",
    description: "Unknown Activity",
    score: 1,
  };
}
