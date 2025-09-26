const hre = require("hardhat");
const { ethers } = hre;

function sortTokens(a, b) {
  const [A, B] = [ethers.utils.getAddress(a), ethers.utils.getAddress(b)];
  return A.toLowerCase() < B.toLowerCase() ? [A, B] : [B, A];
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 部署账户:", deployer.address);

  // ====== 部署 Deployer ======
  const PoolDeployer = await ethers.getContractFactory("SlerfSwapV3PoolDeployer");
  const poolDeployer = await PoolDeployer.deploy();
  await poolDeployer.deployed();
  console.log("✅ PoolDeployer:", poolDeployer.address);

  // ====== 部署 Factory ======
  const Factory = await ethers.getContractFactory("SlerfSwapV3Factory");
  const factory = await Factory.deploy(poolDeployer.address);
  await factory.deployed();
  console.log("✅ Factory:", factory.address);

  // 启用费率
  await (await factory.enableFeeAmount(0, 1)).wait();
  await (await factory.enableFeeAmount(600, 12)).wait();
  await (await factory.enableFeeAmount(1000, 20)).wait();
  await (await factory.enableFeeAmount(3000, 60)).wait();
  await (await factory.enableFeeAmount(10000, 200)).wait();

  // ====== 计算 init code hash（以链上为准）======
  const onchainInitCodeHash = await poolDeployer.poolInitCodeHash();
  console.log("🔑 链上 poolInitCodeHash:", onchainInitCodeHash);

  // （可选）本地计算一份做对比
  const Pool = await ethers.getContractFactory("SlerfSwapV3Pool");
  const localInitCodeHash = ethers.utils.keccak256(Pool.bytecode);
  console.log("🧮 本地 poolInitCodeHash:", localInitCodeHash);

  // ====== 你的 token 地址 ======
  const token0 = { address: "0xE17a9DD18329f1f09Ce929198E22F02BE5D7952f" };
  const token1 = { address: "0x679A80e5D2a0fD5aD01D701446d9397a662d9Bcf" };

  // ====== 预测池子地址（务必排序 + uint24）======
  const fee = 0;
  const [T0, T1] = sortTokens(token0.address, token1.address);
  const salt = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["address", "address", "uint24"], [T0, T1, fee])
  );
  const predictedPool = ethers.utils.getCreate2Address(poolDeployer.address, salt, onchainInitCodeHash);
  console.log("🧭 预测池子地址 (CREATE2@deployer):", predictedPool);

  // ====== 创建池子并校验 ======
  try {
    const tx = await factory.createPool(token0.address, token1.address, fee);
    const receipt = await tx.wait();
    const evt = receipt.events?.find((e) => e.event === "PoolCreated");
    const onchainPool = evt?.args?.pool;
    console.log("✅ 0费率池已创建:", onchainPool);

    if (onchainPool?.toLowerCase() !== predictedPool.toLowerCase()) {
      console.warn("⚠️ 预测地址与链上事件地址不一致");
      console.warn("   deployer 作为 CREATE2 地址:", poolDeployer.address);
      console.warn("   salt:", salt);
      console.warn("   onchainInitCodeHash:", onchainInitCodeHash);
      console.warn("   localInitCodeHash:", localInitCodeHash);
      console.warn("   T0:", T0, " T1:", T1, " fee:", fee);
    } else {
      console.log("✨ 预测地址与链上事件地址一致");
    }
  } catch (err) {
    console.log("⚠️ 创建 0费率池时出错（可能已存在）:", err.message || err);
  }

  console.log("\n🎉 部署完成");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
