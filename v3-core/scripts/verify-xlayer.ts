import hre from "hardhat";
import { utils } from "ethers";

// 用法:
// 1. 在 .env 中配置 OKLINK_API_KEY、PRIVATE_KEY、XLAYER_RPC_URL 等节点信息。
// 2. 设置 XLAYER_POOL_DEPLOYER 和 XLAYER_FACTORY 为已经部署在 X Layer 主网的合约地址。
//    如果需要一起开源多个池子，可在 XLAYER_POOLS 中填写以逗号分隔的地址列表。
// 3. 运行 `npx hardhat run --network xlayer scripts/verify-xlayer.ts`
//    或直接执行 `npx hardhat okverify --network xlayer <address>` 完成单独验证。

type VerificationTarget = {
  name: string;
  address: string;
  args?: readonly string[];
  contract?: string;
};

const REQUIRED_MESSAGE =
  "Missing required environment variable for verification on X Layer mainnet";

function readEnv(name: string, required = false): string | undefined {
  const value = process.env[name]?.trim();
  if (!value && required) {
    throw new Error(`${REQUIRED_MESSAGE}: ${name}`);
  }
  return value && value.length > 0 ? value : undefined;
}

function normaliseAddress(label: string, address: string): string {
  try {
    return utils.getAddress(address);
  } catch (error) {
    throw new Error(`Invalid address provided for ${label}: ${address}`);
  }
}

async function verify(target: VerificationTarget) {
  console.log(`\n🔍 Verifying ${target.name} @ ${target.address}`);
  await hre.run("okverify", {
    address: target.address,
    constructorArgsParams: target.args ?? [],
    contract: target.contract,
  });
  console.log(`✅ ${target.name} verification task submitted.`);
}

async function main() {
  const poolDeployerAddress = readEnv("XLAYER_POOL_DEPLOYER", true)!;
  const factoryAddress = readEnv("XLAYER_FACTORY", true)!;

  const optionalPoolList = readEnv("XLAYER_POOLS");
  const poolAddresses = optionalPoolList
    ? optionalPoolList
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];

  const targets: VerificationTarget[] = [
    {
      name: "SlerfSwapV3PoolDeployer",
      address: normaliseAddress("XLAYER_POOL_DEPLOYER", poolDeployerAddress),
      contract: "contracts/SlerfSwapV3PoolDeployer.sol:SlerfSwapV3PoolDeployer",
    },
    {
      name: "SlerfSwapV3Factory",
      address: normaliseAddress("XLAYER_FACTORY", factoryAddress),
      args: [normaliseAddress("XLAYER_POOL_DEPLOYER", poolDeployerAddress)],
      contract: "contracts/SlerfSwapV3Factory.sol:SlerfSwapV3Factory",
    },
    ...poolAddresses.map((address, index) => ({
      name: `SlerfSwapV3Pool#${index + 1}`,
      address: normaliseAddress(`XLAYER_POOLS[${index}]`, address),
      contract: "contracts/SlerfSwapV3Pool.sol:SlerfSwapV3Pool",
    })),
  ];

  for (const target of targets) {
    try {
      await verify(target);
    } catch (error) {
      console.error(`❌ Failed to verify ${target.name}:`, error);
    }
  }

  console.log("\n🎉 Verification process finished. Check OKLink for final status.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
