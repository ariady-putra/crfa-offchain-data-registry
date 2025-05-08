// import { bech32 } from "bech32";
import { randomUUID } from "crypto";

export default function placeholder(): Manifest {
  // const uuid = Buffer.from(randomUUID(), "utf8");
  // const id = bech32.toWords(uuid);

  return {
    version: 0,
    id: randomUUID(), // bech32.encode("manifest", id),
    institution: {
      name: "Cardano",
      network: "Mainnet",
    },
    transactions: [],
  };
}

export type Manifest = {
  version: number;
  id: string;
  institution: Institution;
  transactions: Transaction[];
};

export type Institution = {
  name: string;
  network: string;
};

export type Transaction = {
  transaction_id: string;
  timestamp: number;
  type: string;
  description: string;
  confidence: number | null;
  accounts: {
    user: Account[];
    other: Account[];
  };
  withdrawal_amount?: Asset;
  network_fee: Asset;
  metadata: Record<string, any>[];
};

export type Account = {
  address: string;
  role: string;
  total: Asset[];
};

export type Asset = {
  currency: string;
  amount: number;
};
