const hre = require('hardhat')
const { ethers } = hre

// -------------------- 配置（可用 .env 覆盖） --------------------
const FEES = [0, 600, 1000, 3000, 10000]
const MIN_TICK = -887272
const MAX_TICK = 887272

const CFG = {
  FACTORY: process.env.FACTORY || '0x2299c38c6e8855e18Db808386a1cd1bC9abDc625',        // 已部署 SlerfSwapV3Factory
  POOL_DEPLOYER: process.env.POOL_DEPLOYER || '0x7426F5fc3aBB2286A7848bf1387458D7ae7cE9c9', // 已部署 SlerfSwapV3PoolDeployer
  TOKEN0: process.env.TOKEN0 || '0xE17a9DD18329f1f09Ce929198E22F02BE5D7952f',       // 测试代币0
  TOKEN1: process.env.TOKEN1 || '0x679A80e5D2a0fD5aD01D701446d9397a662d9Bcf',       // 测试代币1
  WETH:   process.env.WETH   || '0xe538905cf8410324e03a5a23c1c177a474d59b2b',       // 作为 WETH 占位（可直接用 TOKEN0）

  // 若你已经单独部署过 NFTDescriptor 库，可以在这里传入地址，脚本会直接复用
  DESC_LIB_ADDR: process.env.DESC_LIB_ADDR || "",

  // 测试规模
  MINT_AMOUNT0: ethers.utils.parseEther(process.env.MINT_AMOUNT0 || '1000000'),
  MINT_AMOUNT1: ethers.utils.parseEther(process.env.MINT_AMOUNT1 || '1000000'),
  LP_AMOUNT0:   ethers.utils.parseEther(process.env.LP_AMOUNT0   || '10000'),
  LP_AMOUNT1:   ethers.utils.parseEther(process.env.LP_AMOUNT1   || '10000'),
  SWAP_IN:      ethers.utils.parseEther(process.env.SWAP_IN      || '100'),   // 每个费率做一笔 swap
  DEADLINE_SECS: parseInt(process.env.DEADLINE_SECS || '3600', 10),

  // 集中价区半径（单位：tickSpacing 的倍数）
  K_CONC: parseInt(process.env.K_CONC || '20', 10),

  // 原生币的 label（给 Descriptor 用），默认 OKB；也可改成 ETH
  NATIVE_LABEL: process.env.NATIVE_LABEL || 'OKB',
}

// -------------------- 内联 ABI（避免依赖 core artifacts） --------------------
const IFactoryAbi = [
  'function getPool(address,address,uint24) view returns (address)',
  'function createPool(address,address,uint24) returns (address)',
  'function feeAmountTickSpacing(uint24) view returns (int24)',
  'function enableFeeAmount(uint24,int24)',
  'function setPoolProtocolFee(address,address,uint24)',
]

const IPoolDeployerAbi = [
  'function poolInitCodeHash() view returns (bytes32)',
]

const IPoolAbi = [
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)',
  'function initialize(uint160 sqrtPriceX96)',
  'function collectProtocol(address recipient, uint128 amount0Requested, uint128 amount1Requested) returns (uint128 amount0, uint128 amount1)',
  'function tickSpacing() view returns (int24)',
]

// 最小 ERC20 ABI（不依赖 TestERC20 artifact）
const ERC20_MIN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)', // 如无此函数，safeMint 会忽略
]

// -------------------- 工具函数 --------------------
const MaxUint128 = ethers.BigNumber.from('0xffffffffffffffffffffffffffffffff')

function nowPlus(sec) {
  return Math.floor(Date.now() / 1000) + sec
}
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms))
}
function sortTokens(a, b) {
  const A = ethers.utils.getAddress(a)
  const B = ethers.utils.getAddress(b)
  return A.toLowerCase() < B.toLowerCase() ? [A, B] : [B, A]
}
function fullRange(spacing) {
  const lower = Math.ceil(MIN_TICK / spacing) * spacing
  const upper = Math.floor(MAX_TICK / spacing) * spacing
  return { lower, upper }
}
function centeredRange(spacing, k) {
  return { lower: -k * spacing, upper: +k * spacing }
}
async function erc20At(addr, signerOrProvider = ethers.provider.getSigner()) {
  return new ethers.Contract(addr, ERC20_MIN_ABI, signerOrProvider)
}
async function safeMint(token, to, amt) {
  try {
    const tx = await token.mint(to, amt)
    await tx.wait()
  } catch (_) {
    // 非可铸代币，忽略
  }
}
async function approveAll(token0, token1, owner, spender, tag) {
  if (!spender) throw new Error(`[${tag}] spender 未定义`)
  await (await token0.connect(owner).approve(spender, ethers.constants.MaxUint256)).wait()
  await (await token1.connect(owner).approve(spender, ethers.constants.MaxUint256)).wait()
}
function pickTokenIdFromReceipt(rc) {
  for (const ev of rc.events || []) {
    if (ev.event === 'IncreaseLiquidity' && ev.args?.tokenId) return ev.args.tokenId
    if (ev.event === 'Transfer' && ev.args?.tokenId) return ev.args.tokenId
  }
  return undefined
}

async function getFactorySafe(name, fqName) {
  try {
    return await ethers.getContractFactory(fqName)
  } catch (e) {
    // 回退到非 FQN
  }
  return await ethers.getContractFactory(name)
}

// -------------------- 部署 Quoter（自适配 V2 / V1） --------------------
async function deployQuoter(factoryAddr, wethAddr) {
  const tries = [
    {
      label: 'QuoterV2(factory,weth)',
      fq: 'contracts/lens/QuoterV2.sol:QuoterV2',
      name: 'QuoterV2',
      args: [factoryAddr, wethAddr],
    },
    { label: 'QuoterV2(factory)', fq: 'contracts/lens/QuoterV2.sol:QuoterV2', name: 'QuoterV2', args: [factoryAddr] },
    {
      label: 'Quoter(factory,weth)',
      fq: 'contracts/lens/Quoter.sol:Quoter',
      name: 'Quoter',
      args: [factoryAddr, wethAddr],
    },
    { label: 'Quoter(factory)', fq: 'contracts/lens/Quoter.sol:Quoter', name: 'Quoter', args: [factoryAddr] },
  ]

  for (const t of tries) {
    try {
      const F = await getFactorySafe(t.name, t.fq)
      const q = await F.deploy(...t.args)
      await q.deployed()
      console.log(`✅ ${t.label} =`, q.address)
      return { quoter: q, quoterName: t.name }
    } catch (e) {
      console.log(`ℹ️ ${t.label} 失败:`, e.reason || e.message || e)
    }
  }
  console.log('⚠️ 未部署 Quoter（所有已知构造签名均不匹配，继续后续测试…）')
  return { quoter: null, quoterName: null }
}

// -------------------- 部署 PositionDescriptor（自动链接 NFTDescriptor 库） --------------------
async function deployDescriptor(wethAddr, nativeLabel, descLibAddr) {
  // 确保有库地址
  let libAddr = descLibAddr
  if (libAddr) {
    console.log('ℹ️ 使用外部 DESC_LIB_ADDR =', libAddr)
  } else {
    const Lib = await getFactorySafe('NFTDescriptor', 'contracts/libraries/NFTDescriptor.sol:NFTDescriptor')
    const lib = await Lib.deploy()
    await lib.deployed()
    libAddr = lib.address
    console.log('✅ NFTDescriptor lib   =', libAddr)
  }

  // 链接库
  const D = await ethers.getContractFactory(
    'contracts/NonfungibleTokenPositionDescriptor.sol:NonfungibleTokenPositionDescriptor',
    {
      libraries: { NFTDescriptor: libAddr },
    }
  )

  // 1) 你的源码构造看起来是 (address _WETH9, bytes32 _nativeCurrencyLabelBytes)
  const labelBytes32 = ethers.utils.formatBytes32String(nativeLabel || 'OKB')
  try {
    const desc = await D.deploy(wethAddr, labelBytes32)
    await desc.deployed()
    console.log('✅ PositionDescriptor  =', desc.address, ' using constructor (address,bytes32)')
    return desc
  } catch (e) {
    console.log('ℹ️ 尝试 NonfungibleTokenPositionDescriptor(address,bytes32) 失败:', e.message || e)
  }

  // 兜底：如果你的分支是 OffChain 版本，尝试 FQN
  try {
    const DO = await getFactorySafe(
      'NonfungibleTokenPositionDescriptorOffChain',
      'contracts/NonfungibleTokenPositionDescriptorOffChain.sol:NonfungibleTokenPositionDescriptorOffChain'
    )
    // 尝试 (address weth, bytes32)
    const desc = await DO.deploy(wethAddr, labelBytes32)
    await desc.deployed()
    console.log('✅ NonfungibleTokenPositionDescriptorOffChain =', desc.address)
    return desc
  } catch (e) {
    console.log('ℹ️ OffChain 描述器工厂获取失败：', e.message || e)
  }

  throw new Error('无法部署任何可用的 PositionDescriptor（请检查源码分支/构造签名）')
}

// -------------------- 部署 periphery 组件 --------------------
async function deployPeriphery(factoryAddr, wethAddr) {
  console.log('▶️ 部署 periphery 组件…')

  // TickLens
  const TickLensF = await getFactorySafe('TickLens', 'contracts/lens/TickLens.sol:TickLens')
  const tickLens = await TickLensF.deploy()
  await tickLens.deployed()
  console.log('✅ TickLens           =', tickLens.address)

  // Quoter（自适配）
  const { quoter } = await deployQuoter(factoryAddr, wethAddr)

  // SwapRouter
  const SwapRouterF = await getFactorySafe('SwapRouter', 'contracts/SwapRouter.sol:SwapRouter')
  const router = await SwapRouterF.deploy(factoryAddr, wethAddr)
  await router.deployed()
  console.log('✅ SwapRouter         =', router.address)

  // PositionDescriptor（自动链接 NFTDescriptor 库）
  const desc = await deployDescriptor(wethAddr, CFG.NATIVE_LABEL, CFG.DESC_LIB_ADDR)
  console.log('✅ NonfungibleTokenPositionDescriptor=', desc.address)

  // NonfungiblePositionManager
  const NPMF = await getFactorySafe(
    'NonfungiblePositionManager',
    'contracts/NonfungiblePositionManager.sol:NonfungiblePositionManager'
  )
  const npm = await NPMF.deploy(factoryAddr, wethAddr, desc.address)
  await npm.deployed()
  console.log('✅ NPM                =', npm.address)

  return { tickLens, quoter, router, desc, npm }
}

// -------------------- 确保池存在并初始化 --------------------
async function ensurePool(factory, tokenA, tokenB, fee) {
  let pool = await factory.getPool(tokenA, tokenB, fee)
  if (pool === ethers.constants.AddressZero) {
    console.log(`   • 池不存在，createPool(${tokenA}, ${tokenB}, ${fee})`)
    const tx = await factory.createPool(tokenA, tokenB, fee)
    const rc = await tx.wait()
    const ev = rc.events?.find((e) => e.event === 'PoolCreated')
    pool = ev?.args?.pool || (await factory.getPool(tokenA, tokenB, fee))
  }
  console.log('   • Pool =', pool)

  const poolC = new ethers.Contract(pool, IPoolAbi, ethers.provider.getSigner())
  const slot0 = await poolC.slot0()
  if (slot0.sqrtPriceX96.eq(0)) {
    const sqrt1_1 = ethers.BigNumber.from(2).pow(96) // 1:1
    console.log('   • 初始化池到 1:1 价格，sqrtPriceX96 =', sqrt1_1.toString())
    await (await poolC.initialize(sqrt1_1)).wait()
  }
  return pool
}

// -------------------- 主流程 --------------------
async function main() {
  const [deployer, trader] = await ethers.getSigners()
  console.log('👤 deployer:', deployer.address)

  // 直连 Factory / PoolDeployer
  const factory = new ethers.Contract(CFG.FACTORY, IFactoryAbi, deployer)
  const poolDeployer = new ethers.Contract(CFG.POOL_DEPLOYER, IPoolDeployerAbi, deployer)

  try {
    console.log('🔑 poolInitCodeHash:', await poolDeployer.poolInitCodeHash())
  } catch (_) {}

  // 部署 periphery
  const { router, npm, desc } = await deployPeriphery(CFG.FACTORY, CFG.WETH)

  // 强校验（防止后续 .address 报错）
  if (!router?.address) throw new Error('Router 部署失败或未返回，请检查 deployPeriphery() 返回值')
  if (!npm?.address)    throw new Error('NonfungiblePositionManager 部署失败或未返回，请检查 deployPeriphery() 返回值')
  if (!desc?.address)   throw new Error('PositionDescriptor 部署失败或未返回，请检查 deployPeriphery() 返回值')

  // 代币与授权
  const token0 = await erc20At(CFG.TOKEN0, deployer)
  const token1 = await erc20At(CFG.TOKEN1, deployer)
  const token0T = token0.connect(trader)
  const token1T = token1.connect(trader)

  // await safeMint(token0, deployer.address, CFG.MINT_AMOUNT0)
  // await safeMint(token1, deployer.address, CFG.MINT_AMOUNT1)
  // await safeMint(token0T, trader.address, CFG.MINT_AMOUNT0.div(10))
  // await safeMint(token1T, trader.address, CFG.MINT_AMOUNT1.div(10))

  console.log('🧾 Router =', router.address)
  console.log('🧾 NPM    =', npm.address)

  await approveAll(token0, token1, deployer, router.address, 'Router')
  await approveAll(token0, token1, deployer, npm.address,    'NPM')
  await approveAll(token0T, token1T, trader,   router.address, 'Router(trader)')

  // 确保所有费率启用
  for (const fee of FEES) {
    const cur = await factory.feeAmountTickSpacing(fee)
    if (cur.eq(0)) {
      const spacing = fee === 0 ? 1 : fee === 600 ? 12 : fee === 1000 ? 20 : fee === 3000 ? 60 : 200
      console.log(`🛠 enableFeeAmount(${fee}, ${spacing})`)
      await (await factory.enableFeeAmount(fee, spacing)).wait()
      await sleep(500)
    }
  }

  // 每个费率分别跑：全范围 + 集中区间（mint → swap → decrease → collect；协议费 collectProtocol）
  // for (const fee of FEES) {
  //   console.log(`\n================ Fee=${fee} ================`)
  //   const poolAddr = await ensurePool(factory, CFG.TOKEN0, CFG.TOKEN1, fee)
  //   const pool = new ethers.Contract(poolAddr, IPoolAbi, deployer)

  //   // 获取 spacing & 构造区间
  //   const spacing = (await factory.feeAmountTickSpacing(fee)).toNumber()
  //   const FR = fullRange(spacing)
  //   const CR = centeredRange(spacing, CFG.K_CONC)
  //   console.log(`   • tickSpacing=${spacing} | 全范围=[${FR.lower}, ${FR.upper}] | 集中=[${CR.lower}, ${CR.upper}]`)

  //   const [T0, T1] = sortTokens(CFG.TOKEN0, CFG.TOKEN1)
  //   const scenarios = [
  //     { label: '全范围', ticks: FR },
  //     { label: '集中区间', ticks: CR },
  //   ]

  //   for (const sc of scenarios) {
  //     console.log(`   🔹 ${sc.label} → mint`)
  //     const mintRc = await (
  //       await npm.mint({
  //         token0: T0,
  //         token1: T1,
  //         fee,
  //         tickLower: sc.ticks.lower,
  //         tickUpper: sc.ticks.upper,
  //         amount0Desired: CFG.LP_AMOUNT0,
  //         amount1Desired: CFG.LP_AMOUNT1,
  //         amount0Min: 0,
  //         amount1Min: 0,
  //         recipient: deployer.address,
  //         deadline: nowPlus(CFG.DEADLINE_SECS),
  //       })
  //     ).wait()
  //     const tokenId = pickTokenIdFromReceipt(mintRc)
  //     if (!tokenId) throw new Error(`[${sc.label}] 未取到 tokenId`)
  //     const pos = await npm.positions(tokenId)
  //     console.log(`     • tokenId=${tokenId.toString()}, liquidity=${pos.liquidity.toString()}`)

  //     console.log(`   🔹 ${sc.label} → swap（trader: token0→token1）`)
  //     await (
  //       await router.connect(trader).exactInputSingle({
  //         tokenIn: CFG.TOKEN0,
  //         tokenOut: CFG.TOKEN1,
  //         fee,
  //         recipient: trader.address,
  //         deadline: nowPlus(CFG.DEADLINE_SECS),
  //         amountIn: CFG.SWAP_IN,
  //         amountOutMinimum: 0,
  //         sqrtPriceLimitX96: 0,
  //       })
  //     ).wait()

  //     console.log(`   🔹 ${sc.label} → decreaseLiquidity(50%) + collect`)
  //     const before0 = await token0.balanceOf(deployer.address)
  //     const before1 = await token1.balanceOf(deployer.address)
  //     const half = (await npm.positions(tokenId)).liquidity.div(2)

  //     await (
  //       await npm.decreaseLiquidity({
  //         tokenId,
  //         liquidity: half,
  //         amount0Min: 0,
  //         amount1Min: 0,
  //         deadline: nowPlus(CFG.DEADLINE_SECS),
  //       })
  //     ).wait()

  //     await (
  //       await npm.collect({
  //         tokenId,
  //         recipient: deployer.address,
  //         amount0Max: MaxUint128,
  //         amount1Max: MaxUint128,
  //       })
  //     ).wait()

  //     const after0 = await token0.balanceOf(deployer.address)
  //     const after1 = await token1.balanceOf(deployer.address)
  //     console.log(
  //       `     • LP 收益：Δtoken0=${after0.sub(before0).toString()}  Δtoken1=${after1.sub(before1).toString()}`
  //     )
  //   }

  //   if (fee > 0) {
  //     console.log('   🔹 collectProtocol（协议费）')
  //     const b0 = await token0.balanceOf(deployer.address)
  //     const b1 = await token1.balanceOf(deployer.address)
  //     try {
  //       await (
  //         await pool.collectProtocol(deployer.address, MaxUint128, MaxUint128)
  //       ).wait()
  //       const a0 = await token0.balanceOf(deployer.address)
  //       const a1 = await token1.balanceOf(deployer.address)
  //       console.log(`     • 协议费入账：Δtoken0=${a0.sub(b0).toString()}  Δtoken1=${a1.sub(b1).toString()}`)
  //     } catch (e) {
  //       console.log('     • collectProtocol 失败（可能未设置协议费或权限限制）：', e.message || e)
  //     }
  //   } else {
  //     console.log('   • 0 费率池，预期无协议手续费')
  //   }
  // }

  // console.log('\n🎉 全部费率（全范围 + 集中区间）测试完成')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})