import { referenceResult } from "./builder.js";

export const apiResponse = { data: referenceResult() };
export const consumerResponse = {
  payment: {
    network: "hedera:testnet",
    asset: "HBAR",
    amount: "0.20",
    transaction_id: "0.0.7392014@1788556321.441",
  },
  data: referenceResult(),
};
