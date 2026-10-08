// Subset of the pinned mainnet helper ABI; no ABI signature is invented.
export const helperAbi = [
  {
    name: "Claimed",
    type: "event",
    inputs: [
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    name: "claim",
    type: "function",
    inputs: [{ name: "recipient", type: "address", internalType: "address" }],
    outputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    name: "claims",
    type: "function",
    inputs: [{ name: "wallet", type: "address", internalType: "address" }],
    outputs: [
      { name: "claimableBlock", type: "uint64", internalType: "uint64" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;
