# 🦥 SlerfSwap V3 - Decentralized Exchange Protocol

Community-driven concentrated liquidity AMM on the X-Layer network, featuring efficient capital usage, reduced swap fees, and a full suite of core and periphery contracts derived from Uniswap V3.

## Badges
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Network: X-Layer](https://img.shields.io/badge/Network-X--Layer-green.svg)](https://www.okx.com/xlayer)
[![Fee Tiers](https://img.shields.io/badge/Fee%20Tiers-0.00%25%7C0.06%25%7C0.10%25%7C0.30%25%7C1.00%25-orange.svg)]()

## Key Features
- Concentrated liquidity with customizable price ranges for LPs
- Five fee tiers (0.00%, 0.06%, 0.10%, 0.30%, 1.00%) with a 30% protocol share on non-zero tiers
- Optimized for X-Layer throughput and low-gas execution paths
- Native WOKB support across core and periphery components
- Standalone deployment with verifiable `POOL_INIT_CODE_HASH`

## Mainnet Deployment (X-Layer)

### v3-core
- Deployment account: `0x83DDC122D6fd6611Fab890f6369440421B029C1D`
- PoolDeployer: `0x7426F5fc3aBB2286A7848bf1387458D7ae7cE9c9`
- Factory: `0x2299c38c6e8855e18Db808386a1cd1bC9abDc625`
- On-chain `poolInitCodeHash`: `0x0ae75198b494ad1f1b0510036c21aad5e3f8647d8260c8e1b941c3b1101573ed`
- Local `poolInitCodeHash`: `0x0ae75198b494ad1f1b0510036c21aad5e3f8647d8260c8e1b941c3b1101573ed`

### v3-periphery
- TickLens: `0xc184523a7F5fA75D0CD161e5325855180Bc5c613`
- QuoterV2 (factory, WOKB): `0xb77ccb98b88D39f570Ef6121Ab5B1a2850fce3c6`
- SwapRouter: `0x88CBD52c55FEDA2E64faD06E99aA53b24272a9CB`
- NFTDescriptor library: `0x688a335888FfDd4782e3dB2D09c636BBD923E66F`
- PositionDescriptor: `0x2262c03bEbCcb9b5BD2D0B1908A120F7e4AAbfe3` (constructor args: `address`, `bytes32`)
- NonfungibleTokenPositionDescriptor: `0x2262c03bEbCcb9b5BD2D0B1908A120F7e4AAbfe3`
- NonfungiblePositionManager: `0xc6Cbd8e4DFFe14BC7Eb300E381abAE3b35D0A0c9`

## Architecture Overview

### Core Contracts
- `SlerfSwapV3Factory`: creates pools, tracks fee tiers, manages protocol-level parameters
- `SlerfSwapV3Pool`: automated market maker with concentrated liquidity support
- `SlerfSwapV3PoolDeployer`: deterministic pool deployment helper with hashed bytecode

### Periphery Contracts
- `SlerfSwapV3SwapRouter`: user-facing swap router for single and multi-hop swaps
- `SlerfSwapV3QuoterV2`: gasless price quoting endpoint for off-chain tooling
- `SlerfSwapV3NonfungiblePositionManager`: mints and manages LP NFT positions
- `SlerfSwapV3TickLens` and `SlerfSwapV3PositionDescriptor`: read helpers for UI dashboards

## Development

### Prerequisites
- Node.js 20 or newer
- Hardhat toolchain or Remix IDE
- MetaMask wallet configured for X-Layer endpoints
- Access to deployed Factory and WOKB addresses listed above

### Recommended Workflow
1. Deploy or verify `SlerfSwapV3Factory` and `SlerfSwapV3PoolDeployer`.
2. Confirm the `poolInitCodeHash` matches the deployed bytecode in both core and referencing libraries.
3. Update periphery constructor parameters (factory, WOKB, position descriptor) before deployment.
4. Deploy periphery contracts (router, quoter, tick lens, position manager) and verify on X-Layer explorers.
5. Register fee tiers and enable pools via the factory initializer.

### Local Testing
```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Hardhat compilation
npx hardhat compile
```

### Deployment Scripts
```bash
# Deploy to X-Layer testnet (configure RPC and keys beforehand)
npm run deploy:testnet

# Deploy to X-Layer mainnet
npm run deploy:mainnet
```

## Fee Model
- Supported fee tiers: 0.00%, 0.06%, 0.10%, 0.30%, 1.00%
- Liquidity providers accrue fees proportionally to their active liquidity range
- Non-zero fee tiers divert 30% of collected fees to the protocol when the fee switch is enabled

| Tier | Total Swap Fee | LP Share (70%) | Protocol Share (30%) |
| --- | --- | --- | --- |
| 0.00% | 0.00% | 0.00% | 0.00% |
| 0.06% | 0.06% | 0.042% | 0.018% |
| 0.10% | 0.10% | 0.070% | 0.030% |
| 0.30% | 0.30% | 0.210% | 0.090% |
| 1.00% | 1.00% | 0.700% | 0.300% |

## Security and Auditing
- Derived from audited Uniswap V3 architecture with SlerfSwap-specific configuration
- Internal review completed; community audits encouraged
- Reentrancy guards applied to periphery entrypoints where applicable
- Arithmetic safety via Solidity 0.8 overflow checks

## Legal and Licensing
- Licensed under GNU General Public License v3.0; see `LICENSE`
- Based on Uniswap V3, licensed under GPL-3.0-or-later, with required attribution
- Contributors must ensure all submissions remain GPL-3.0 compatible

## Contributing
1. Fork the repository
2. Create a feature branch
3. Implement changes with tests when applicable
4. Submit a pull request including rationale and verification steps

## Community Links
- Website: http://slerfswap.com/
- Documentation: https://docs.slerfswap.com/
- GitHub: https://github.com/SlerfSwap
- Twitter: https://twitter.com/SlerfTools
- Telegram: https://t.me/SlerfTools
- Telegram Channel: https://t.me/SlerfTools_Official

## Disclaimer
- Software provided as-is without warranty; use at your own risk
- No financial or investment advice; users must assess their own risk tolerance
- Ensure compliance with local regulations in all jurisdictions of use

Built with care by the SlerfSwap community.
