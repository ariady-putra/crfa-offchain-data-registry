import * as file from "fs";
import path from "path";
import { manifest } from "../types/_";
import { Asset, Manifest, Transaction } from "../types/manifest";
import { bf, lucid } from "../util/_";
import { calcConfidenceScoreOf } from "../scoring/_";

//#region Initialize Known Dapps
const dappsPath = "./dApps";
const dapps = file.readdirSync(dappsPath);

const distinctProjects: Set<string> = new Set();
const distinctCategories: Set<string> = new Set([
  "receive_ada",
  "send_tokens",
  "stake_delegation",
  "stake_registration",
  "yield_farming",
]);

const scDesc: Record<string, any> = {};

for (const dapp of dapps) {
  const dappPath = path.join(dappsPath, dapp);
  const dappFile = file.readFileSync(dappPath).toString();

  const { projectName, category, subCategory, scripts } = JSON.parse(dappFile);

  for (const { name, versions } of scripts) {
    for (const { contractAddress } of versions) {
      const type =
        `${!subCategory || subCategory === '-' ? category : subCategory}`
          .replaceAll(" ", "_")
          .toLowerCase();

      scDesc[contractAddress] = {
        name,
        projectName,
        category: type === "dex" ? "other_dex" : type,
        description: `${name ?? "Unknown activity"} on ${projectName}`,
        role: `${name}`.startsWith(projectName) ? name : `${projectName} ${name ?? "Address"}`,
      };

      distinctProjects.add(scDesc[contractAddress].projectName);
      distinctCategories.add(scDesc[contractAddress].category);
    }
  }
}

const stats = {
  category: {
    names: [...distinctCategories].sort((l, r) => l < r ? -1 : 1),
    count: distinctCategories.size,
  },
  merchant: {
    names: [...distinctProjects].sort((l, r) => l.toLowerCase() < r.toLowerCase() ? -1 : 1),
    count: distinctProjects.size,
  },
};
//#endregion

export async function getStats(): Promise<typeof stats> {
  return stats;
}

// Sample:
//
// addr: addr1qyh99v0nhc8e7vcvl3gy8lhwkg7h3ykqgy2nud6gdkdad3fj9q6vf6cgnw48r2ljtmaauxn4s44uuskz3hvggjsslkaqd0rgze
// hash: a40824aa2656a2afb67812ef6dcbed354abe26e9c3fc79fca5c2e47a459ddcb1
// Minswap
export async function describeAddressTransaction(address: string, hash: string): Promise<Manifest> {
  //#region Blockfrost AddressInfo
  const addressInfo = await bf.getAddressInfo(address);
  if (addressInfo.error) throw addressInfo;
  const stakeAddressBech32 = addressInfo.stake_address;
  //#endregion

  //#region Lucid AddressDetails
  const addressDetails = await lucid.getAddressDetails(address);
  // type AddressDetails = {
  //   type: "Base" | "Enterprise" | "Pointer" | "Reward" | "Byron";
  //   networkId: number;
  //   address: {
  //     bech32: string;
  //     hex: string;
  //   };
  //   paymentCredential?: { type: "Key" | "Script"; hash: string; };
  //   stakeCredential?: { type: "Key" | "Script"; hash: string; };
  // };
  //#endregion

  //#region Tx Info
  const tx = await bf.getTransactionInfo(hash);
  if (tx.error) throw {
    status_code: 400,
    message: "Invalid or malformed transaction hash.",
  };
  const timestamp = tx.block_time * 1_000;
  const networkFee = BigInt(tx.fees);
  //#endregion

  //#region Tx UTXOs
  type Amounts = Record<string, bigint>;

  const addressAmounts: Record<string, Amounts> = {};
  const userAddressAmounts: Record<string, Amounts> = {};
  const otherAddressAmounts: Record<string, Amounts> = {};

  let type = undefined;
  let description = undefined;
  // let actualFee = 0n;
  const probableProjects: Set<string> = new Set();

  const utxos = await bf.getTransactionUTXOs(hash);
  if (utxos.error) throw utxos;
  const { inputs, outputs } = utxos;

  //#region Process UTxO Inputs
  for (const { address, amount, collateral, reference } of inputs) {
    if (collateral || reference) continue;
    if (!addressAmounts[address]) addressAmounts[address] = {};

    for (const { unit, quantity } of amount) {
      const currency = unit === "lovelace" ? "ADA" : unit;
      const amount = BigInt(quantity);
      addressAmounts[address][currency] = (addressAmounts[address][currency] ?? 0n) - amount;

      // if (currency === "ADA") actualFee -= amount;
    }

    // TODO: Temp!
    if (scDesc[address]) {
      type = scDesc[address].category;
      description = scDesc[address].description;
    }
  }
  //#endregion

  //#region Process UTxO Outputs
  for (const { address, amount, collateral, reference } of outputs) {
    if (collateral || reference) continue;
    if (!addressAmounts[address]) addressAmounts[address] = {};

    for (const { unit, quantity } of amount) {
      const currency = unit === "lovelace" ? "ADA" : unit;
      const amount = BigInt(quantity);
      addressAmounts[address][currency] = (addressAmounts[address][currency] ?? 0n) + amount;

      // if (currency === "ADA") actualFee += amount;
    }

    // TODO: Temp!
    if (scDesc[address]) {
      type = scDesc[address].category;
      description = scDesc[address].description;
      probableProjects.add(scDesc[address].projectName);
    }
  }
  //#endregion

  //#region Group AddressAmounts by PKH
  for (const key of Object.keys(addressAmounts)) {
    const { paymentCredential } = await lucid.getAddressDetails(key);
    if (paymentCredential?.hash === addressDetails.paymentCredential?.hash) {
      userAddressAmounts[key] = addressAmounts[key];
    } else {
      otherAddressAmounts[key] = addressAmounts[key];
    }
  }
  //#endregion
  //#endregion

  //#region Tx Metadata
  let metadata = await bf.getTransactionMetadata(hash);
  if (metadata.error) metadata = [];

  for (const { json_metadata } of metadata) {
    if (json_metadata?.msg?.length) {
      for (const project of distinctProjects) {
        if (json_metadata.msg[0].includes(project)) {
          probableProjects.add(project);
        }
      }
    }
  }
  //#endregion

  //#region Tx Withdrawals
  // const withdrawalAmount = networkFee - actualFee;
  let withdrawalAmount: bigint = 0n;
  const withdrawals = await bf.getTransactionWithdrawals(hash);
  if (withdrawals && !withdrawals.error && withdrawals.length) {
    withdrawalAmount = withdrawals.reduce(
      (sum: bigint, withdrawal: { address: string; amount: string; }) =>
        sum += withdrawal.address === stakeAddressBech32 ? BigInt(withdrawal.amount) : 0n,
      0n,
    );
  }
  //#endregion

  //#region TODO: Move these to utils
  const isKeyAddress =
    async (address: string) => {
      const { paymentCredential } = await lucid.getAddressDetails(address);
      return paymentCredential?.type === "Key";
    };

  const isLovelaceOrADA =
    (currency: string): boolean => {
      const c = currency.toLowerCase();
      return c === "lovelace" || c === "ada";
    };

  const convertAmountToNumber =
    (amount: bigint, decimals: number): number => {
      const t = BigInt(10 ** decimals);
      return parseFloat(`${amount / t}.${`${(amount < 0n ? -amount : amount) % t}`.padStart(decimals, "0")}`);
    };

  const getTotalAmounts =
    async (address: string): Promise<Asset[]> => {
      return await Promise.all(Object.keys(addressAmounts[address])
        .filter((currency) => addressAmounts[address][currency] !== 0n)
        .map(async (currency) => {
          let fromUnit = isLovelaceOrADA(currency)
            ? { metadata: { name: currency, decimals: 6 } }
            : await bf.getAssetInfo(currency);
          if (fromUnit.error) fromUnit = { metadata: { name: currency, decimals: 0 } };

          const decimals = fromUnit.metadata?.decimals ?? 0;

          return {
            currency: fromUnit.metadata?.name ?? fromUnit.onchain_metadata?.name ?? fromUnit.fingerprint ?? currency,
            amount: convertAmountToNumber(addressAmounts[address][currency], decimals),
          };
        }),
      );
    };

  const convertAddressAmountsToAccounts =
    (addressAmounts: Record<string, Amounts>, addressRole?: string) =>
      Promise.all(Object.keys(addressAmounts)
        .map(async (address) => {
          return {
            address,
            role: addressRole ?? scDesc[address]?.role ?? `Unknown ${await isKeyAddress(address) ? "Address" : "Script"}`,
            total: await getTotalAmounts(address),
          };
        }),
      );
  //#endregion

  //#region Intermediary TxObject
  const transaction: Transaction = {
    transaction_id: hash,
    timestamp,
    type: `${type}`,
    description: `${description}`,
    confidence: null,

    accounts: {
      user: await convertAddressAmountsToAccounts(userAddressAmounts, "User Address"),
      other: await convertAddressAmountsToAccounts(otherAddressAmounts),
    },

    withdrawal_amount: !withdrawalAmount ? undefined : {
      currency: "ADA",
      amount: convertAmountToNumber(withdrawalAmount, 6),
    },

    network_fee: {
      currency: "ADA",
      amount: convertAmountToNumber(networkFee, 6),
    },

    metadata,
  };
  //#endregion

  //#region Post-process TxObject
  const highestConfidence: Transaction = await calcConfidenceScoreOf(
    transaction,
    [...probableProjects],
    addressInfo,
    addressDetails,
    tx,
    utxos,
  );
  //#endregion

  return {
    ...manifest.default(),
    transactions: [highestConfidence],
  };
}
