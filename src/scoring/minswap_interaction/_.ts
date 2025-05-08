import * as minswap_create_tx from "./minswap_create_swap_tx";
import * as minswap_swap_tx from "./minswap_swap_tx";
import * as minswap_create_withdraw_tx from "./minswap_create_withdraw_tx";
import * as minswap_withdraw_tx from "./minswap_withdraw_tx";
import * as minswap_create_deposit_tx from "./minswap_create_deposit_tx";
import * as minswap_stake_liquidity from "./minswap_stake_liquidity";
import * as minswap_default_fallback from "./minswap_default_fallback";

export const scoring = [
  minswap_create_tx.score,
  minswap_swap_tx.score,
  minswap_create_withdraw_tx.score,
  minswap_withdraw_tx.score,
  minswap_create_deposit_tx.score,
  minswap_stake_liquidity.score,
];

export const fallback =
  minswap_default_fallback.score;
