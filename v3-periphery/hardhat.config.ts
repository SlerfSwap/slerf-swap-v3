import { HardhatUserConfig } from "hardhat/config";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-ethers";
import "@okxweb3/hardhat-explorer-verify";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const OKLINK_API_KEY = process.env.OKLINK_API_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.7.6", settings: { optimizer: { enabled: true, runs: 50 } } },
      // { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } },
    ]
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false, // 手动运行
    disambiguatePaths: false,
  },
  sourcify: {
    enabled: true,
  },
  networks: {
    // ✅ X Layer 测试网（最新 Chain ID = 1952）
    xlayerTestnet: {
      url: "https://xlayertestrpc.okx.com/terigon", // ✅ 推荐第一个 RPC
      // url: "https://testrpc.xlayer.tech/terigon",
      chainId: 1952,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 100000000, // 1 gwei
    },
    // ✅ X Layer 主网（Chain ID = 196）
    xlayer: {
      url: "https://rpc.xlayer.tech", // ✅ 推荐第一个 RPC
      // 备用: "https://xlayerrpc.okx.com"
      chainId: 196,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    xlayerMainnet: {
      url: "https://rpc.xlayer.tech",
      chainId: 196,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  okxweb3explorer: {
    apiKey: OKLINK_API_KEY,
  },
};

export default config;
