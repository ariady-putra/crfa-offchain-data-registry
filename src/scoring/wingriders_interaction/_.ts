import * as wingriders_harvest from "./wingriders_harvest";
import * as wingriders_withdraw_lp from "./wingriders_withdraw_lp";
import * as wingriders_create_liquidity_removal from "./wingriders_create_liquidity_removal";
import * as wingriders_liquidity_removal from "./wingriders_liquidity_removal";
import * as wingriders_create_swap from "./wingriders_create_swap";
import * as wingriders_default_fallback from "./wingriders_default_fallback";

export const scoring = [
  wingriders_harvest.score,
  wingriders_withdraw_lp.score,
  wingriders_create_liquidity_removal.score,
  wingriders_liquidity_removal.score,
  wingriders_create_swap.score,
];

export const fallback =
  wingriders_default_fallback.score;
