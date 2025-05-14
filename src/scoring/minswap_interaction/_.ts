import * as minswap_create_tx from "./minswap_create_swap_tx";
import * as minswap_swap_tx from "./minswap_swap_tx";
import * as minswap_create_withdraw_liquidity from "./minswap_create_withdraw_liquidity";
import * as minswap_withdraw_liquidity from "./minswap_withdraw_liquidity";
import * as minswap_masterchef from "./minswap_masterchef";
import * as minswap_create_withdraw_tx from "./minswap_create_withdraw_tx";
import * as minswap_withdraw_tx from "./minswap_withdraw_tx";
import * as minswap_stake_min from "./minswap_stake_min";
import * as minswap_unstake_min from "./minswap_unstake_min";
import * as minswap_receive_staking_rewards from "./minswap_receive_staking_rewards";
import * as minswap_create_deposit_tx from "./minswap_create_deposit_tx";
import * as minswap_stake_liquidity from "./minswap_stake_liquidity";
import * as minswap_create_zap_out from "./minswap_create_zap_out";
import * as minswap_zap_out from "./minswap_zap_out";
import * as minswap_default_fallback from "./minswap_default_fallback";

export const scoring = [
  minswap_create_tx.score,
  minswap_swap_tx.score,
  minswap_create_withdraw_liquidity.score,
  minswap_withdraw_liquidity.score,
  minswap_masterchef.score,
  minswap_create_withdraw_tx.score,
  minswap_withdraw_tx.score,
  minswap_stake_min.score,
  minswap_unstake_min.score,
  minswap_receive_staking_rewards.score,
  minswap_create_deposit_tx.score,
  minswap_stake_liquidity.score,
  minswap_create_zap_out.score,
  minswap_zap_out.score,
];

export const fallback =
  minswap_default_fallback.score;
