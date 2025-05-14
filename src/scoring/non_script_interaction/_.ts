import * as receive_ada from "./receive_ada";
import * as sent_ada from "./send_ada";
import * as receive_tokens from "./receive_tokens";
import * as sent_tokens from "./send_tokens";
import * as token_minting from "./token_minting";
import * as catalyst_registration from "./catalyst_registration";
import * as catalyst_deregistration from "./catalyst_deregistration";
import * as stake_delegation from "./stake_delegation";
import * as multi_stake_delegation from "./multi_stake_delegation";
import * as setup_collateral from "./setup_collateral";
// import * as self_transaction from "./self_transaction";
import * as default_fallback from "./unknown_activity";

export const scoring = [
  receive_ada.score,
  sent_ada.score,
  receive_tokens.score,
  sent_tokens.score,
  token_minting.score,
  catalyst_registration.score,
  catalyst_deregistration.score,
  stake_delegation.score,
  multi_stake_delegation.score,
  setup_collateral.score,
  // self_transaction.score,
];

export const fallback =
  default_fallback.score;
