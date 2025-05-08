import * as minswap from "./minswap_interaction/_";

import * as nosc from "./non_script_interaction/_";

import { Transaction } from "../types/manifest";

type ScoringFn = (...args: any) => any;
type Scoring = {
  scoring: ScoringFn[];
  fallback: ScoringFn;
};
const scoring: Record<string, Scoring> = {
  Minswap: minswap,
};

export async function calcConfidenceScoreOf(
  intermediaryTx: Transaction,
  probableProjects: string[],
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  const projectsConfidence =
    probableProjects.length
      ? await Promise.all(
        probableProjects.map(
          (project) =>
            confidenceOf(
              intermediaryTx,
              scoring[project]?.scoring ?? [],
              99,
              bfAddressInfo,
              lucidAddressDetails,
              txInfo,
              txUTXOs,
            )
        )
      )
      : [await confidenceOf(
        intermediaryTx,
        nosc.scoring,
        99,
        bfAddressInfo,
        lucidAddressDetails,
        txInfo,
        txUTXOs,
      )];

  // maybe multiple dApps transactions are composed into this 1 transaction, in the future we can take the 2nd and 3rd confidence as well
  // that is why right now we're sorting this, even though only the highest one is taken at the moment
  const confidenceDesc = projectsConfidence.sort(
    (l, r) => {
      return (r.confidence ?? 0) - (l.confidence ?? 0);
    });

  const highestConfidence = confidenceDesc[0];
  // if the highest confidence is below threshold (ie, 50), then use fallback because the description is likely to be wrong
  if (highestConfidence.confidence && highestConfidence.confidence <= 50) {
    const fallbackConfidence =
      probableProjects.length
        ? await Promise.all(
          probableProjects.map(
            (project) =>
              confidenceOf(
                intermediaryTx,
                scoring[project] ? [scoring[project].fallback] : [],
                50,
                bfAddressInfo,
                lucidAddressDetails,
                txInfo,
                txUTXOs,
              )
          )
        )
        : [await confidenceOf(
          intermediaryTx,
          [nosc.fallback],
          0,
          bfAddressInfo,
          lucidAddressDetails,
          txInfo,
          txUTXOs,
        )];
    return { ...intermediaryTx, ...fallbackConfidence[0] };
  } else {
    return { ...intermediaryTx, ...highestConfidence };
  }
}

async function confidenceOf(
  intermediaryTx: Transaction,
  scoring: ((...args: any) => any)[],
  maxConfidence: number,
  bfAddressInfo: Record<string, any>,
  lucidAddressDetails: Record<string, any>,
  txInfo: Record<string, any>,
  txUTXOs: Record<string, any>,
) {
  if (!scoring.length) return { ...intermediaryTx, confidence: null };

  const scores = await Promise.all(scoring.map(
    (scoreOf) => {
      return scoreOf(intermediaryTx, bfAddressInfo, lucidAddressDetails, txInfo, txUTXOs);
    }),
  );

  // in the future we can provide 2nd or 3rd altenative scores
  const scoresDesc = scores.sort(
    (l, r) => {
      return r.score - l.score;
    });

  const { type, description, score } = scoresDesc[0];
  const adjustedScore = (score < .9) ? (score / 2) : ((score - .9) * 5 + .5);
  const confidence = Math.round(adjustedScore * maxConfidence);

  return { type, description, confidence };
}
