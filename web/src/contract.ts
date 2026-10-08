import {
  createPublicClient,
  http,
  keccak256,
  isAddress,
  decodeEventLog,
  erc721Abi,
  erc20Abi,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { helperAbi } from "./helper.abi";
import { sorpheraAbi } from "./Sorphera.abi";
import { sorpheraVaultAbi } from "./SorpheraVault.abi";
import { sorpheraRouterAbi } from "./SorpheraRouter.abi";
import { sorpheraVaultFactoryAbi } from "./SorpheraVaultFactory.abi";
import {
  checkPurchase,
  expandLines,
  type Game,
  type Line,
  type Round,
  type StatusCode,
} from "./core";
export interface Deployment {
  mode: "demo" | "read-only" | "transactions";
  transactionsActivated: boolean;
  chainId: number;
  rpcUrl: string | null;
  lottery: Address | null;
  router: Address | null;
  factory: Address | null;
  deploymentBlock: string | null;
  runtimeCodeHashes: {
    lottery: Hex;
    router: Hex;
    factory: Hex;
    vaults: Record<string, Hex>;
    helper: Hex;
  } | null;
  abiSha256: string | null;
  confirmations: number;
}
export function activationError(c: Deployment, write = false): string | null {
  if (c.mode === "demo") return "Demo never signs or broadcasts.";
  if (c.chainId !== 1)
    return "Only Ethereum mainnet is supported. No testnet is activated.";
  if (
    !c.rpcUrl ||
    !c.lottery ||
    !c.router ||
    !c.factory ||
    !c.deploymentBlock ||
    !c.runtimeCodeHashes ||
    !c.abiSha256
  )
    return "Verified deployment configuration is missing.";
  if (
    ![c.lottery, c.router, c.factory].every(
      (a) => isAddress(a) && BigInt(a) !== 0n,
    ) ||
    !/^\d+$/.test(c.deploymentBlock)
  )
    return "Invalid deployment configuration.";
  if (!Number.isInteger(c.confirmations) || c.confirmations < 1)
    return "A confirmation policy is required.";
  if (write && (c.mode !== "transactions" || !c.transactionsActivated))
    return "Transactions have not been explicitly activated.";
  return null;
}
export function requireActivation(c: Deployment, write = false) {
  const error = activationError(c, write);
  if (error) throw new Error(error);
}
const canonicalABI = JSON.stringify([
  sorpheraAbi,
  sorpheraVaultAbi,
  sorpheraRouterAbi,
  sorpheraVaultFactoryAbi,
]);
export async function abiDigest() {
  const bytes = new TextEncoder().encode(canonicalABI);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export class ContractAdapter {
  readonly client: PublicClient;
  constructor(readonly config: Deployment) {
    requireActivation(config);
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(config.rpcUrl!, { retryCount: 2, timeout: 12000 }),
    });
  }
  async verify() {
    requireActivation(this.config);
    if ((await this.client.getChainId()) !== this.config.chainId)
      throw new Error("RPC network changed. Reload the verified connection.");
    if ((await abiDigest()) !== this.config.abiSha256)
      throw new Error("ABI fingerprint does not match the activated release.");
    for (const name of ["lottery", "router", "factory"] as const) {
      const code = await this.client.getCode({ address: this.config[name]! });
      if (!code || keccak256(code) !== this.config.runtimeCodeHashes![name])
        throw new Error(`Unverified ${name} bytecode.`);
    }
    const [chain, factory, binding, router] = await Promise.all([
      this.client.readContract({
        address: this.config.lottery!,
        abi: sorpheraAbi,
        functionName: "deploymentChainId",
      }),
      this.client.readContract({
        address: this.config.lottery!,
        abi: sorpheraAbi,
        functionName: "factory",
      }),
      this.client.readContract({
        address: this.config.factory!,
        abi: sorpheraVaultFactoryAbi,
        functionName: "lottery",
      }),
      this.client.readContract({
        address: this.config.factory!,
        abi: sorpheraVaultFactoryAbi,
        functionName: "router",
      }),
    ]);
    if (
      chain !== 1n ||
      factory.toLowerCase() !== this.config.factory!.toLowerCase() ||
      binding.toLowerCase() !== this.config.lottery!.toLowerCase() ||
      router.toLowerCase() !== this.config.router!.toLowerCase()
    )
      throw new Error("Deployment bindings do not match.");
  }
  async round(game: Game, id?: bigint): Promise<Round> {
    const address = this.config.lottery!;
    const abi = sorpheraAbi;
    const roundId =
      id ??
      (await this.client.readContract({
        address,
        abi,
        functionName: "latestRound",
        args: [game],
      }));
    const [r, salesEnabled] = await Promise.all([
      this.client.readContract({
        address,
        abi,
        functionName: "getRound",
        args: [game, roundId],
      }),
      this.client.readContract({ address, abi, functionName: "salesEnabled" }),
    ]);
    if (r.status === 0) throw new Error("This round has not opened.");
    const [group, pending] = await Promise.all([
      this.client.readContract({
        address,
        abi,
        functionName: "groups",
        args: [game, r.group],
      }),
      this.client.readContract({
        address: r.vault,
        abi: sorpheraVaultAbi,
        functionName: "pending",
      }),
    ]);
    let cancellationReview: Round["cancellationReview"];
    if (game === 1 && r.status === 2) {
      const [cursor, total] = await Promise.all([
        this.client.readContract({
          address: r.vault,
          abi: sorpheraVaultAbi,
          functionName: "cancellationCursor",
        }),
        this.client.readContract({
          address: r.vault,
          abi: sorpheraVaultAbi,
          functionName: "requestCount",
        }),
      ]);
      cancellationReview = { cursor: Number(cursor), total: Number(total) };
    }
    return {
      game,
      id: roundId,
      status: r.status as StatusCode,
      price: r.price,
      start: Number(r.start),
      cutoff: Number(r.cutoff),
      actualETH: group[2],
      securedNFTs: Number(group[5]),
      pendingPulls: Number(pending),
      salesEnabled,
      cancellationReview,
    };
  }
  async signer(wallet: WalletClient) {
    requireActivation(this.config, true);
    await this.verify();
    const [accounts, chain] = await Promise.all([
      wallet.getAddresses(),
      wallet.getChainId(),
    ]);
    if (chain !== 1 || !accounts[0])
      throw new Error("Connect an Ethereum mainnet wallet and review again.");
    return accounts[0];
  }
  async buy(wallet: WalletClient, expected: Round, lines: Line[]) {
    const account = await this.signer(wallet);
    const r = await this.round(expected.game, expected.id);
    const block = await this.client.getBlock();
    const value = checkPurchase(r, expected, lines, Number(block.timestamp));
    const { request } = await this.client.simulateContract({
      account,
      address: this.config.lottery!,
      abi: sorpheraAbi,
      functionName: "buy",
      args: [r.game, r.id, expandLines(lines)],
      value,
    });
    await this.signer(wallet); // account/network and deployment rechecked immediately before signing
    if (
      (await wallet.getAddresses())[0]?.toLowerCase() !== account.toLowerCase()
    )
      throw new Error("Wallet changed. Review again.");
    return wallet.writeContract(request);
  }
  async entitlement(
    game: Game,
    origin: bigint,
    ticket: bigint,
    account: Address,
  ) {
    const address = this.config.lottery!;
    const abi = sorpheraAbi;
    const divisor = await this.client.readContract({
      address,
      abi,
      functionName: "entitlement",
      args: [game, origin, ticket, account],
    });
    const r = await this.client.readContract({
      address,
      abi,
      functionName: "getRound",
      args: [game, origin],
    });
    const [group, claimed] = await Promise.all([
      this.client.readContract({
        address,
        abi,
        functionName: "groups",
        args: [game, r.group],
      }),
      this.client.readContract({
        address,
        abi,
        functionName: "claimedETH",
        args: [game, r.group, ticket],
      }),
    ]);
    return { divisor, amount: group[3] - claimed, vault: r.vault };
  }
  recipient(recipient: string): asserts recipient is Address {
    if (!isAddress(recipient) || BigInt(recipient) === 0n)
      throw new Error("Enter a valid, nonzero recipient address.");
  }
  async claimETH(
    wallet: WalletClient,
    game: Game,
    origin: bigint,
    ids: bigint[],
    recipient: Address,
  ) {
    this.recipient(recipient);
    const account = await this.signer(wallet);
    if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length)
      throw new Error("Choose 1–100 distinct tickets.");
    const rights = await Promise.all(
      ids.map((id) => this.entitlement(game, origin, id, account)),
    );
    if (!rights.some((r) => r.amount > 0n))
      throw new Error("There is no ETH available to claim.");
    // The same ABI method pays both ETH prizes and cancelled-round refunds. No salesEnabled gate.
    const { request } = await this.client.simulateContract({
      account,
      address: this.config.lottery!,
      abi: sorpheraAbi,
      functionName: "claimETH",
      args: [game, origin, ids, recipient],
    });
    if ((await this.signer(wallet)).toLowerCase() !== account.toLowerCase())
      throw new Error("Wallet changed. Review again.");
    return wallet.writeContract(request);
  }
  async verifiedVault(game: Game, origin: bigint) {
    const r = await this.client.readContract({
      address: this.config.lottery!,
      abi: sorpheraAbi,
      functionName: "getRound",
      args: [game, origin],
    });
    const code = await this.client.getCode({ address: r.vault });
    // Immutable fields make each vault's runtime hash unique. Require a release verifier to supply
    // the exact originating vault hash for a claim session, never trust metadata or a user URL.
    if (
      !code ||
      keccak256(code) !==
        this.config.runtimeCodeHashes!.vaults[r.vault.toLowerCase()]
    )
      throw new Error(
        "Origin vault runtime must be verified for this claim session.",
      );
    const [lottery, g, id] = await Promise.all([
      this.client.readContract({
        address: r.vault,
        abi: sorpheraVaultAbi,
        functionName: "lottery",
      }),
      this.client.readContract({
        address: r.vault,
        abi: sorpheraVaultAbi,
        functionName: "game",
      }),
      this.client.readContract({
        address: r.vault,
        abi: sorpheraVaultAbi,
        functionName: "round",
      }),
    ]);
    if (
      lottery.toLowerCase() !== this.config.lottery!.toLowerCase() ||
      g !== game ||
      id !== origin
    )
      throw new Error("Origin vault does not match the round.");
    return r.vault;
  }
  async inventory(game: Game, origin: bigint, cursor = 0n) {
    const address = await this.verifiedVault(game, origin);
    const total = await this.client.readContract({
      address,
      abi: sorpheraVaultAbi,
      functionName: "assetCount",
    });
    if (cursor < 0n || cursor > total)
      throw new Error("Invalid inventory cursor.");
    const n = Number(total - cursor > 20n ? 20n : total - cursor);
    const assets = await Promise.all(
      Array.from({ length: n }, async (_, i) => {
        const index = cursor + BigInt(i);
        const a = await this.client.readContract({
          address,
          abi: sorpheraVaultAbi,
          functionName: "assets",
          args: [index],
        });
        const owner = await this.client
          .readContract({
            address: a[0],
            abi: erc721Abi,
            functionName: "ownerOf",
            args: [a[1]],
          })
          .catch(() => null);
        return {
          index,
          collection: a[0],
          tokenId: a[1],
          claimed: a[4],
          secured: owner?.toLowerCase() === address.toLowerCase(),
        };
      }),
    );
    return { assets, next: cursor + BigInt(n), total };
  }
  async claimNFTs(
    wallet: WalletClient,
    game: Game,
    origin: bigint,
    ticket: bigint,
    indices: bigint[],
    recipient: Address,
    receiverAcknowledged: boolean,
  ) {
    this.recipient(recipient);
    const account = await this.signer(wallet);
    await this.entitlement(game, origin, ticket, account);
    const address = await this.verifiedVault(game, origin);
    if (
      !indices.length ||
      indices.length > 20 ||
      new Set(indices).size !== indices.length
    )
      throw new Error("Choose 1–20 distinct NFT assets.");
    if (recipient.toLowerCase() === address.toLowerCase())
      throw new Error("The vault cannot receive its own claim.");
    if (
      (await this.client.getCode({ address: recipient })) &&
      !receiverAcknowledged
    )
      throw new Error(
        "Confirm that the recipient contract supports ERC721 safe transfers.",
      );
    for (const index of indices) {
      const a = await this.client.readContract({
        address,
        abi: sorpheraVaultAbi,
        functionName: "assets",
        args: [index],
      });
      if (a[4])
        throw new Error("An asset was already delivered. Refresh inventory.");
      if (
        (
          await this.client.readContract({
            address: a[0],
            abi: erc721Abi,
            functionName: "ownerOf",
            args: [a[1]],
          })
        ).toLowerCase() !== address.toLowerCase()
      )
        throw new Error("An asset is not secured in the vault.");
    }
    const { request } = await this.client.simulateContract({
      account,
      address,
      abi: sorpheraVaultAbi,
      functionName: "claimNFTs",
      args: [ticket, indices, recipient],
    });
    if ((await this.signer(wallet)).toLowerCase() !== account.toLowerCase())
      throw new Error("Wallet changed. Review again.");
    return wallet.writeContract(request);
  }
  async claimTokens(
    wallet: WalletClient,
    game: Game,
    origin: bigint,
    ticket: bigint,
    recipient: Address,
    deadline: bigint,
  ) {
    this.recipient(recipient);
    const account = await this.signer(wallet);
    const rights = await this.entitlement(game, origin, ticket, account);
    const address = await this.verifiedVault(game, origin);
    const token = await this.client.readContract({
      address,
      abi: sorpheraVaultAbi,
      functionName: "prizeToken",
    });
    const [balance, queued, claimed, block] = await Promise.all([
      this.client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }),
      this.client.readContract({
        address,
        abi: sorpheraVaultAbi,
        functionName: "queuedTokens",
      }),
      this.client.readContract({
        address,
        abi: sorpheraVaultAbi,
        functionName: "tokenClaimed",
        args: [ticket],
      }),
      this.client.getBlock(),
    ]);
    if (deadline <= block.timestamp || deadline > block.timestamp + 3600n)
      throw new Error("Review a fresh reward deadline within one hour.");
    if ((balance + queued) / rights.divisor <= claimed)
      throw new Error("No purchaser tokens are available.");
    const { request } = await this.client.simulateContract({
      account,
      address,
      abi: sorpheraVaultAbi,
      functionName: "claimTokens",
      args: [ticket, recipient, deadline],
    });
    if ((await this.signer(wallet)).toLowerCase() !== account.toLowerCase())
      throw new Error("Wallet changed. Review again.");
    return wallet.writeContract(request); // Receipt confirms queueing only, not helper delivery.
  }
  async deliverPurchaserRewards(
    wallet: WalletClient,
    game: Game,
    origin: bigint,
    recipient: Address,
  ) {
    this.recipient(recipient);
    const account = await this.signer(wallet);
    const vault = await this.verifiedVault(game, origin);
    const helper = await this.client.readContract({
      address: vault,
      abi: sorpheraVaultAbi,
      functionName: "helper",
    });
    const code = await this.client.getCode({ address: helper });
    if (!code || keccak256(code) !== this.config.runtimeCodeHashes!.helper)
      throw new Error("Purchaser reward helper is not verified.");
    const [pending, block] = await Promise.all([
      this.client.readContract({
        address: helper,
        abi: helperAbi,
        functionName: "claims",
        args: [recipient],
      }),
      this.client.getBlock(),
    ]);
    if (pending[1] === 0n || block.number < pending[0])
      throw new Error(
        "No matured helper delivery is available. Queueing alone is not delivery.",
      );
    const { request } = await this.client.simulateContract({
      account,
      address: helper,
      abi: helperAbi,
      functionName: "claim",
      args: [recipient],
    });
    if ((await this.signer(wallet)).toLowerCase() !== account.toLowerCase())
      throw new Error("Wallet changed. Review again.");
    return { hash: await wallet.writeContract(request), helper };
  }
  async purchaserDelivery(hash: Hex, helper: Address, recipient: Address) {
    const receipt = await this.receipt(hash);
    for (const l of receipt.logs) {
      if (l.address.toLowerCase() !== helper.toLowerCase()) continue;
      try {
        const e = decodeEventLog({
          abi: helperAbi,
          data: l.data,
          topics: l.topics,
        });
        if (
          e.eventName === "Claimed" &&
          e.args.recipient.toLowerCase() === recipient.toLowerCase()
        )
          return { state: "delivered" as const, amount: e.args.amount };
      } catch {
        /* unrelated log */
      }
    }
    return { state: "unconfirmed" as const, amount: 0n };
  }
  async receipt(hash: Hex) {
    const receipt = await this.client.waitForTransactionReceipt({
      hash,
      confirmations: this.config.confirmations,
      timeout: 120000,
    });
    if (receipt.status !== "success")
      throw new Error("Transaction failed onchain.");
    return receipt;
  }
  async nftOutcomes(hash: Hex, vault: Address) {
    const r = await this.receipt(hash);
    const outcomes = r.logs
      .filter((l) => l.address.toLowerCase() === vault.toLowerCase())
      .flatMap((l) => {
        try {
          const e = decodeEventLog({
            abi: sorpheraVaultAbi,
            data: l.data,
            topics: l.topics,
          });
          if (
            e.eventName === "NFTClaimed" ||
            e.eventName === "NFTClaimFailed" ||
            e.eventName === "SharedAssetVote"
          )
            return [
              {
                index: e.args.index,
                state:
                  e.eventName === "NFTClaimed"
                    ? "delivered"
                    : e.eventName === "NFTClaimFailed"
                      ? "failed"
                      : "awaiting-consensus",
              },
            ];
        } catch {
          /* unrelated event */
        }
        return [];
      });
    // A vote and delivery may occur for the same asset in one transaction.
    // Report its last event, so a successful transfer is never left awaiting consensus.
    return [
      ...new Map(outcomes.map((outcome) => [outcome.index, outcome])).values(),
    ];
  }
}
export const explorerTx = (hash: Hex) => `https://etherscan.io/tx/${hash}`;
