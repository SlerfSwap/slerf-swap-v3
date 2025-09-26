# Deployment and Verification Guide

This document summarizes the minimal steps required to deploy the Slerf Swap V3 core contracts to X Layer and publish the source code on OKLink.

## 1. Deployment Workflow

### 1.1 Prerequisites
- Install Node.js (v20 or newer is recommended).
- Run `npm install` inside the project to install Hardhat, `@okxweb3/hardhat-explorer-verify`, `@nomiclabs/hardhat-ethers`, and other dependencies.
- Create a `.env` file with the following keys. (Never commit secrets to git.)
  ```ini
  PRIVATE_KEY=0xYourPrivateKey
  XLAYER_RPC_URL=YourRPC_URL
  OKLINK_API_KEY=YourOklinkApiKey
  ```

### 1.2 Compile Contracts
Execute a clean compilation and make sure the compiler settings match the ones used for deployment:
```bash
npx hardhat compile --force
```
Key settings in `hardhat.config.ts`:
- `solidity.version = "0.7.6"`
- `optimizer.enabled = true` and `optimizer.runs = 50`
- `evmVersion = "istanbul"` (or omit to use Hardhat's default)

### 1.3 Deployment Script
The project ships with `scripts/deploy-slerfswapv3.js`, which performs the following actions:
1. Deploy `SlerfSwapV3PoolDeployer`
2. Deploy `SlerfSwapV3Factory`
3. Enable standard fee tiers
4. Calculate `poolInitCodeHash`
5. Optionally create a zero-fee pool for chosen token addresses

Run the script on X Layer:
```bash
npx hardhat run --network xlayer scripts/deploy-slerfswapv3.js
```
Record the emitted addresses (PoolDeployer, Factory, pools) and persist them in `.env`:
```ini
XLAYER_POOL_DEPLOYER=0x...
XLAYER_FACTORY=0x...
XLAYER_POOLS=0xPool1,0xPool2  # optional, comma-separated
```

### 1.4 Post-Deployment Checks
Verify the transaction history on [OKLink X Layer](https://www.oklink.com/xlayer):
- Ensure `PoolDeployed` / `PoolCreated` events were emitted
- Confirm the contract code tab still shows "Unverified" before proceeding

## 2. Verification Workflow

### 2.1 Requirements
- `.env` contains the deployed addresses, RPC endpoint, API key, and signer key
- Local source code and compiler configuration are identical to what was used for deployment

### 2.2 Batch Verification Script
`scripts/verify-xlayer.ts` wraps Hardhat's `okverify` task and submits verification requests for the PoolDeployer, Factory, and each pool listed in `XLAYER_POOLS`:
```bash
npx hardhat run --network xlayer scripts/verify-xlayer.ts
```
Look for `Successfully submitted source code` messages, which indicate that requests were accepted by OKLink.

### 2.3 One-Off Manual Verification (Fallback)
If you only need to verify a single contract, call the task directly:
```bash
npx hardhat okverify \
  --network xlayer \
  --contract contracts/SlerfSwapV3PoolDeployer.sol:SlerfSwapV3PoolDeployer \
  0xPoolDeployerAddress
```
For the factory you must pass the constructor parameter (the pool deployer address):
```bash
npx hardhat okverify \
  --network xlayer \
  --contract contracts/SlerfSwapV3Factory.sol:SlerfSwapV3Factory \
  0xFactoryAddress 0xPoolDeployerAddress
```
Pools have no constructor arguments:
```bash
npx hardhat okverify \
  --network xlayer \
  --contract contracts/SlerfSwapV3Pool.sol:SlerfSwapV3Pool \
  0xPoolAddress
```

### 2.4 Troubleshooting
- **Bytecode mismatch**: Ensure the repository checkout, compiler version, optimizer settings, and file layout are identical to the deployment state. Run `npx hardhat compile --force` and compare the local `deployedBytecode` to the on-chain bytecode if needed.
- **API or network errors**: Double-check `--network xlayer`, the RPC endpoint, and `OKLINK_API_KEY`.
- **Wrong address**: Cross-reference the deployment logs or OKLink records to confirm the correct contract address.

### 2.5 Confirm Verification
On OKLink, open each contract's **Code** tab and ensure:
- Status reads `Verified`
- Compiler version and optimizer settings match your Hardhat configuration
- Source files and ABI are available for download

### 2.6 Recommended Optional Steps
- Keep `.env` out of version control (already covered by `.gitignore`)
- Tag or record the git commit used for deployment and verification
- Store deployment and verification logs for future audits

