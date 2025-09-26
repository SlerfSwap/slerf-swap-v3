# Slerf Swap V3 Periphery Deployment & Verification Guide

This guide explains how to deploy and verify the `@slerf/swap-v3-periphery` suite on X Layer testnet or mainnet.

## 1. Prerequisites

- Node.js 20 or newer.
- Git, plus access to Hardhat via `npx hardhat`.

## 2. Install Dependencies

```sh
yarn install
# or
npm install
```

The first install produces `node_modules/`, `artifacts/`, and `cache/`.

## 3. Configure Environment Variables

`dotenv` loads values from the project-level `.env`. Fill in at least:

```ini
# Deployer key; must hold enough OKB/OKT
PRIVATE_KEY=0x...

# Required for explorer verification
OKX_WEB3_API_KEY=...

# Optional: alternate explorers with an Etherscan-compatible API
ETHERSCAN_API_KEY=...

# Existing on-chain components consumed by the scripts
FACTORY=0x...
POOL_DEPLOYER=0x...
TOKEN0=0x...
TOKEN1=0x...
WETH=0x...

# Optional knobs for the deploy & smoke-test script
MINT_AMOUNT0=1000000
MINT_AMOUNT1=1000000
LP_AMOUNT0=10000
LP_AMOUNT1=10000
SWAP_IN=100
```

If the base `Factory`, `PoolDeployer`, or test tokens are not yet deployed, prepare those addresses before running the scripts.

## 4. Compile Contracts

```sh
yarn hardhat compile
```

The command emits `artifacts/` and `typechain/`. Removing them and recompiling regenerates fresh build outputs.

## 5. Deployment Flow

### 5.1 Pick a Network

`hardhat.config.ts` already defines:

- `xlayerTestnet` (chain ID 1952)
- `xlayer` / `xlayerMainnet` (chain ID 196)

Specify the network via `--network <name>` on each Hardhat command.

### 5.2 Run the Deployment Script

`scripts/deploy-and-test-periphery.js` deploys the periphery contracts and can optionally exercise basic flows (commented out by default):

```sh
npx hardhat run scripts/deploy-and-test-periphery.js --network xlayerTestnet
```

Record the printed addresses:

- `TickLens`
- `Quoter` or `QuoterV2`
- `SwapRouter`
- `NonfungibleTokenPositionDescriptor`
- `NonfungiblePositionManager`

If you already have any of these components, set the corresponding `.env` overrides (for example `DESC_LIB_ADDR`) to skip redeployment.

### 5.3 Constructor Argument Modules

`scripts/args/` contains sample constructor argument files (`swapRouter.args.js`, `quoterV2.args.js`, `nonfungiblePositionManager.args.js`). Update them with your final addresses or create new modules for later reuse.

## 6. Verify Contracts

`scripts/verify-xlayer.ts` wraps the `@okxweb3/hardhat-explorer-verify` `okverify` task. Useful environment variables:

| Variable | Description |
| --- | --- |
| `CONTRACT_TARGETS` | Comma-separated targets using `FQN@address`, e.g. `contracts/SwapRouter.sol:SwapRouter@0xabc...`. |
| `CONTRACT_ADDRESS` | Address list without FQNs; use either this or `CONTRACT_TARGETS`. |
| `CONSTRUCTOR_ARGS_PATH` | JS/TS module exporting the constructor arguments array. |
| `CONTRACT_FQN` | Default FQN applied when a target omits one. |
| `LIBRARIES_PATH` | Optional module exporting `{ LibraryName: address }`, for linked libraries such as `NFTDescriptor`. |
| `NO_COMPILE` | Set to `true` to skip compilation (use when artifacts are already current). |
| `IS_PROXY` | Set to `true` if verifying a proxy. |
| `LIST_OKX_NETWORKS` | Set to `true` to print the supported networks and exit. |

### 6.1 Example: Verify Multiple Contracts in One Run

```sh
CONTRACT_TARGETS="\
contracts/SwapRouter.sol:SwapRouter@0xswapRouterAddress,\
contracts/NonfungiblePositionManager.sol:NonfungiblePositionManager@0xnpmAddress" \
CONSTRUCTOR_ARGS_PATH=scripts/args/swapRouter.args.js \
OKX_WEB3_API_KEY=xxx \
PRIVATE_KEY=0x... \
npx hardhat run scripts/verify-xlayer.ts --network xlayerTestnet
```

- `SwapRouter` reuses `scripts/args/swapRouter.args.js`.
- `NonfungiblePositionManager` can be verified in a separate run with its own argument module if needed.

### 6.2 Verifying Contracts with Linked Libraries

If `NonfungibleTokenPositionDescriptor` links the `NFTDescriptor` library, prepare a module that exports the mapping:

```js
// scripts/args/libraries.nftDescriptor.js
module.exports = {
  NFTDescriptor: "0xYourLibraryAddress"
};
```

Then run:

```sh
CONTRACT_TARGETS="contracts/NonfungibleTokenPositionDescriptor.sol:NonfungibleTokenPositionDescriptor@0xdescriptor" \
LIBRARIES_PATH=scripts/args/libraries.nftDescriptor.js \
CONSTRUCTOR_ARGS_PATH=scripts/args/descriptor.args.js \
npx hardhat run scripts/verify-xlayer.ts --network xlayer
```

`descriptor.args.js` should return something like `[WETH_ADDRESS, ethers.utils.formatBytes32String("OKB")]` to match the constructor signature.

### 6.3 List Supported Networks

```sh
LIST_OKX_NETWORKS=true npx hardhat run scripts/verify-xlayer.ts
```

### 6.4 Troubleshooting

- **Missing API key** – The script warns `OKX_WEB3_API_KEY is not set`; add it to `.env` and retry.
- **Constructor mismatch** – Check that `scripts/args/*.js` match the parameters used during deployment.
- **Library not supplied** – Provide a `LIBRARIES_PATH` when the contract relies on external libraries.
- **Stale build outputs** – Remove `artifacts/` and `cache/`, then rerun `yarn hardhat compile`.

## 7. Follow-Up

1. Capture the deployment output in `deploys.md` or a custom JSON so the team can reference it later.
2. Keep the files under `scripts/args/` up to date with the latest addresses to streamline future verification runs.
