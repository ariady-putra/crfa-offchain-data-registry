// type: catalyst_registration
// description: Catalyst Registration

import { Transaction } from "../../types/manifest";

// Catalyst registration metadata
const weighting = {
  metadata: 1.00,
};

export async function score(
  { metadata }: Transaction,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const weights = await Promise.all([
    calcW1(metadata),
  ]);

  const description = "Catalyst Registration";
  const type = "catalyst_registration";

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
 * label: 61284 (CIP-0015 - Catalyst registration) alongside
 * label: 61285 (CIP-0015 - Catalyst witness)
 * 
 * @param metadata Transaction Metadata
 * @returns [Score, AdditionalData]
 */
async function calcW1(metadata: Record<string, any>[]): Promise<Calculation> {
  if (!metadata.length) return [0, undefined];

  return [weighting.metadata * metadata.filter(
    ({ label }) =>
      label === "61284" || label === "61285"
  ).length / metadata.length, undefined];
}
