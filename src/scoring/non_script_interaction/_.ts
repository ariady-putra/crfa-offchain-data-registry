import * as receive_ada from "./receive_ada";
import * as sent_tokens from "./send_tokens";
import * as stake_delegation from "./stake_delegation";
import * as default_fallback from "./unknown_activity";

export const scoring = [
  receive_ada.score,
  sent_tokens.score,
  stake_delegation.score
];

export const fallback =
  default_fallback.score;
