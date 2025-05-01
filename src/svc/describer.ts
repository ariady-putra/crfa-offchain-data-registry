import * as file from "fs";
import path from "path";
import { manifest } from "../types/_";
import { Asset, Manifest } from "../types/manifest";
import { bf, lucid } from "../util/_";

//#region init known dApps
const dappsPath = "./dApps";
const dapps = file.readdirSync(dappsPath);

const distinctProjects: Set<string> = new Set();
const distinctCategories: Set<string> = new Set();

const scDesc: Record<string, any> = {};

for (const dapp of dapps) {
  const dappPath = path.join(dappsPath, dapp);
  const dappFile = file.readFileSync(dappPath).toString();

  const { projectName, category, subCategory, scripts } = JSON.parse(dappFile);

  for (const { name, versions } of scripts) {
    for (const { contractAddress } of versions) {
      scDesc[contractAddress] = {
        name,
        projectName,
        category: `${!subCategory || subCategory === '-' ? category : subCategory}`.toLowerCase(),
        description: `${name ?? "Unknown activity"} on ${projectName}`,
        role: `${name}`.startsWith(projectName) ? name : `${projectName} ${name}`,
      };

      distinctProjects.add(scDesc[contractAddress].projectName);
      distinctCategories.add(scDesc[contractAddress].category);
    }
  }
}

const stats = {
  category: {
    names: [...distinctCategories],
    count: distinctCategories.size,
  },
  merchant: {
    names: [...distinctProjects],
    count: distinctProjects.size,
  },
};
//#endregion

export async function getStats(): Promise<typeof stats> {
  return stats;
}

// Tests:
//
// addr: addr1q8xg2rdmlczjpcc4tzzg6r7yn0jjsf5cx804jh7j6zfeuuhpl7vfve65mysdlltmvuq0mggmhk33ccfhmmllmsd4jvhqmqdc8g
// hash: 45333dd9467de3ee0b18e42c2d5ea1fe97bef431b7e340ace3d6f5e719938cb1
// VyFi
//
// addr: addr1q83jmn6g4kdvsvpc0d3d8qgc7cv2n9ueyvn9sc009hfd59fnc6exnxljqwxxsz7ljru5jj420kw9ghukvu4yrk748nwq6w2t4l
// hash: 40326b2017487211d1976daa0a130ad7dd0d5fc607a5d7884f446207477b5438
// jpg.store
//
// addr: addr1q89qpj0ystp4shfh3svn8yq9clscanae5ehpplz6td3g9nemg23nvpq7t79swc8gm6hv0d6c7ug2atvcn5nsyttpw0esamrftj
// hash: 1ef6737fa0522d3809064e0db37049edc2c2db15e302f20e20b312867f32fd9c
// SundaeSwap
export async function describeAddressTransaction(address: string, hash: string): Promise<Manifest> {
  const txs = await bf.getAddressTransactions(address);
  if (txs.error) throw txs;

  type Amounts = Record<string, bigint>;
  const addressAmounts: Record<string, Amounts> = {};

  let timestamp = 0;

  let type = undefined;
  let description = undefined;

  let metadata = await bf.getTransactionMetadata(hash);
  if (metadata.error) metadata = [];

  let feeLovelace = 0n;

  let foundTx = false;
  for (const { tx_hash, block_time } of txs) {
    if (tx_hash !== hash) continue;

    timestamp = block_time * 1_000;

    const utxos = await bf.getTransactionUTXOs(tx_hash);
    if (utxos.error) throw utxos;
    const { inputs, outputs } = utxos;

    for (const { address, amount, collateral, reference } of inputs) {
      if (collateral || reference) continue;
      if (!addressAmounts[address]) addressAmounts[address] = {};

      for (const { unit, quantity } of amount) {
        const currency = unit === "lovelace" ? "ADA" : unit;
        const amount = BigInt(quantity);
        addressAmounts[address][currency] = (addressAmounts[address][currency] ?? 0n) - amount;

        if (currency === "ADA") feeLovelace -= amount;
      }

      // TODO: Temp!
      if (scDesc[address]) {
        type = scDesc[address].category;
        description = scDesc[address].description;
      }
    }

    for (const { address, amount, collateral, reference } of outputs) {
      if (collateral || reference) continue;
      if (!addressAmounts[address]) addressAmounts[address] = {};

      for (const { unit, quantity } of amount) {
        const currency = unit === "lovelace" ? "ADA" : unit;
        const amount = BigInt(quantity);
        addressAmounts[address][currency] = (addressAmounts[address][currency] ?? 0n) + amount;

        if (currency === "ADA") feeLovelace += amount;
      }

      // TODO: Temp!
      if (scDesc[address]) {
        type = scDesc[address].category;
        description = scDesc[address].description;
      }
    }

    foundTx = true;
    break;
  }

  if (!foundTx) throw {
    status_code: 400,
    message: "Invalid or malformed transaction hash. Only the last 100 transactions from the address can be queried.",
  };

  const isLovelaceOrADA = (currency: string) => {
    const c = currency.toLowerCase();
    return c === "lovelace" || c === "ada";
  };

  const convertAmountToNumber = (amount: bigint, decimals: number): number | string => {
    try {
      const t = BigInt(10 ** decimals);
      return parseFloat(`${amount / t}.${(amount < 0n ? -amount : amount) % t}`);
    } catch {
      return amount.toString();
    }
  };

  const getTotalAmounts = async (address: string): Promise<Asset[]> => {
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

  return {
    ...manifest.default(),
    transactions: [
      {
        transaction_id: hash,
        timestamp,
        type: `${type}`,
        description: `${description}`,
        confidence: null,

        accounts: {
          user: {
            address,
            role: "User Address",
            total: await getTotalAmounts(address),
          },

          others: await Promise.all(Object.keys(addressAmounts)
            .filter((key) => key !== address)
            .map(async (address) => {
              const { paymentCredential } = await lucid.getAddressDetails(address);
              const isKeyAddress = paymentCredential?.type === "Key";

              return {
                address,
                role: scDesc[address]?.role ?? `Unknown ${isKeyAddress ? "Address" : "Script"}`,
                total: await getTotalAmounts(address),
              };
            }),
          ),
        },

        network_fee: {
          currency: "ADA",
          amount: convertAmountToNumber(feeLovelace, 6),
        },

        metadata,
      },
    ],
  };
}
