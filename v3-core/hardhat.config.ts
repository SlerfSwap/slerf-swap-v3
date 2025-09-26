import { HardhatUserConfig } from "hardhat/config";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-ethers";
import "@okxweb3/hardhat-explorer-verify";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const OKLINK_API_KEY = process.env.OKLINK_API_KEY ?? "";
const XLAYER_RPC_URL =
  process.env.XLAYER_RPC_URL ?? "https://api.zan.top/node/v1/xlayer/mainnet/97ab5b80690f47f9b5a38aa0bcb399f2";
const XLAYER_TESTNET_RPC_URL =
  process.env.XLAYER_TESTNET_RPC_URL ?? "https://xlayertestrpc.okx.com/terigon";

const config: HardhatUserConfig = {
solidity: {
  version: "0.7.6",
  settings: {
    optimizer: {
      enabled: true,
      runs: 50,
    },
  },
},
  contractSizer: {
    alphaSort: true,
    runOnCompile: false, // 手动运行
    disambiguatePaths: false,
  },
  networks: {
    // ✅ X Layer 主网（Chain ID = 196）
    xlayer: {
      url: XLAYER_RPC_URL,
      chainId: 196,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // ✅ X Layer 测试网（最新 Chain ID = 1952）
    xlayertest: {
      url: XLAYER_TESTNET_RPC_URL,
      chainId: 1952,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      xlayer: OKLINK_API_KEY,
      xlayertest: OKLINK_API_KEY,
    },
    customChains: [
      {
        network: "xlayer",
        chainId: 196,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER",
          browserURL: "https://www.oklink.com/xlayer",
        },
      },
      {
        network: "xlayertest",
        chainId: 1952,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER_TESTNET",
          browserURL: "https://www.oklink.com/xlayer-test",
        },
      },
    ],
  },
  okxweb3explorer: {
    apiKey: OKLINK_API_KEY,
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
