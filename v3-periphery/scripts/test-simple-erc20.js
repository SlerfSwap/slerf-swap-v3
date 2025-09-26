/* eslint-disable no-console */
const hre = require('hardhat')
const { ethers } = hre

// --- 延时 & 重试工具 ---
const SLEEP_TX_MS  = Number(process.env.SLEEP_TX_MS  || 1000)
const SLEEP_FEE_MS = Number(process.env.SLEEP_FEE_MS || 1500)
const MAX_RETRIES  = Number(process.env.RETRIES      || 3)

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
async function withRetry(label, fn, { retries = MAX_RETRIES, baseDelay = SLEEP_TX_MS } = {}) {
  let attempt = 0, lastErr
  while (attempt <= retries) {
    try { return await fn() } catch (e) {
      lastErr = e
      const msg = e?.reason || e?.error?.message || e?.message || e
      if (attempt === retries) {
        console.log(`❌ ${label} 失败（已达最大重试次数）：`, msg)
        throw e
      }
      const wait = baseDelay * Math.pow(2, attempt)
      console.log(`⏳ ${label} 失败，将在 ${wait}ms 后第 ${attempt + 1}/${retries} 次重试：`, msg)
      await sleep(wait)
      attempt++
    }
  }
  throw lastErr
}

// ========= 配置（按需用 .env 覆盖）=========
const CFG = {
  FACTORY:     process.env.FACTORY     || '0x2299c38c6e8855e18Db808386a1cd1bC9abDc625',
  SWAP_ROUTER: process.env.SWAP_ROUTER || '0x88CBD52c55FEDA2E64faD06E99aA53b24272a9CB',
  NPM:         process.env.NPM         || '0xc6Cbd8e4DFFe14BC7Eb300E381abAE3b35D0A0c9',

  TOKEN0: process.env.TOKEN0 || '0xE17a9DD18329f1f09Ce929198E22F02BE5D7952f',
  TOKEN1: process.env.TOKEN1 || '0x679A80e5D2a0fD5aD01D701446d9397a662d9Bcf',

  FUND_TRADER_RATIO: parseInt(process.env.FUND_TRADER_RATIO || '10', 10),

  // 这些仅作“默认字符串”，实际会根据 token 的 decimals 用 parseUnits 转成 BigNumber
  LP_AMOUNT0: process.env.LP_AMOUNT0 || '10',
  LP_AMOUNT1: process.env.LP_AMOUNT1 || '10',
  SWAP_IN:    process.env.SWAP_IN    || '1',

  DEADLINE_SECS: parseInt(process.env.DEADLINE_SECS || '3600', 10),
  K_CONC: parseInt(process.env.K_CONC || '20', 10),
  FEES: (process.env.FEES || '600,1000,3000,10000').split(',').map((s) => parseInt(s.trim(), 10)),
}

const PRIVATE_KEY = ''
const TRADER_PRIVATE_KEY = ''

// ========= 轻量 ABI =========
const IFactoryAbi = [
  'function owner() view returns (address)',
  'function getPool(address,address,uint24) view returns (address)',
  'function createPool(address,address,uint24) returns (address)',
  'function feeAmountTickSpacing(uint24) view returns (int24)',
  'function enableFeeAmount(uint24,int24)',
]

const IPoolAbi = [
  'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)', // feeProtocol 在第 6 个返回值（uint8）
  'function initialize(uint160 sqrtPriceX96)',
  'function setFeeProtocol(uint8 feeProtocol0, uint8 feeProtocol1)',
  'function protocolFees() view returns (uint128 token0, uint128 token1)',
  'function collectProtocol(address recipient, uint128 amount0Requested, uint128 amount1Requested) returns (uint128 amount0, uint128 amount1)',
]

const IERC20Abi = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
]

// periphery
const NPM_NAME = 'NonfungiblePositionManager'
const ROUTER_NAME = 'SwapRouter'

// ========= 工具 & 常量 =========
const MIN_TICK = -887272
const MAX_TICK =  887272
const MAX128   = ethers.BigNumber.from('0xffffffffffffffffffffffffffffffff')
const ZeroAddr = ethers.constants.AddressZero
const bn       = (x) => (x && x._isBigNumber ? x : ethers.BigNumber.from(x))
const nowPlus  = (sec) => Math.floor(Date.now() / 1000) + sec

function sortTokens(a, b) {
  const A = ethers.utils.getAddress(a), B = ethers.utils.getAddress(b)
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
async function erc20At(addr, signer) {
  return new ethers.Contract(addr, IERC20Abi, signer)
}
async function approveMax(token, owner, spender, tag) {
  try {
    const alw = await token.allowance(await owner.getAddress(), spender)
    if (alw.gt(ethers.constants.MaxUint256.div(2))) return
    await (await token.connect(owner).approve(spender, ethers.constants.MaxUint256)).wait()
    console.log(`   • approve ${tag} OK`)
  } catch (_) { /* 可能已授权 */ }
}
function pickTokenIdFromReceipt(rc) {
  for (const ev of rc.events || []) {
    if (ev.event === 'IncreaseLiquidity' && ev.args?.tokenId) return ev.args.tokenId
    if (ev.event === 'Transfer'         && ev.args?.tokenId) return ev.args.tokenId
  }
  return undefined
}
async function ensureFee(factory, fee) {
  const cur = await factory.feeAmountTickSpacing(fee)
  if (bn(cur).eq(0)) {
    const spacing = fee === 0 ? 1 : fee === 600 ? 12 : fee === 1000 ? 20 : fee === 3000 ? 60 : 200
    console.log(`   • enableFeeAmount(${fee}, ${spacing})`)
    await (await factory.enableFeeAmount(fee, spacing)).wait()
  }
}
async function ensurePool(factory, tokenA, tokenB, fee, signer) {
  let pool = await factory.getPool(tokenA, tokenB, fee)
  if (pool === ZeroAddr) {
    console.log(`   • 池不存在 → createPool(${tokenA}, ${tokenB}, ${fee})`)
    const rc = await (await factory.createPool(tokenA, tokenB, fee)).wait()
    const ev = rc.events?.find((e) => e.event === 'PoolCreated')
    pool = ev?.args?.pool || (await factory.getPool(tokenA, tokenB, fee))
  }
  const poolC = new ethers.Contract(pool, IPoolAbi, signer)
  const slot = await poolC.slot0()
  if (bn(slot[0]).eq(0)) { // sqrtPriceX96
    const sqrt1_1 = ethers.BigNumber.from(2).pow(96)
    console.log('   • initialize pool @ price=1:1')
    await (await poolC.initialize(sqrt1_1)).wait()
  }
  return pool
}
async function fundTraderByTransfer(tokenD, traderAddr, ratioDiv) {
  const sym = await tokenD.symbol().catch(() => 'TOKEN')
  const bal = await tokenD.balanceOf(await tokenD.signer.getAddress())
  if (bal.isZero()) {
    console.log(`⚠️ ${sym} deployer 余额为 0，无法分发给 trader`)
    return
  }
  const amt = bal.div(ratioDiv)
  if (amt.isZero()) return
  try {
    await (await tokenD.transfer(traderAddr, amt)).wait()
    console.log(`   • 分发给 trader: ${sym} = ${amt.toString()}`)
  } catch (e) {
    console.log('⚠️ 分发失败：', e.message || e)
  }
}
async function pickIncreaseAmounts(token0D, token1D, holder, want0, want1) {
  const [bal0, bal1] = await Promise.all([token0D.balanceOf(holder), token1D.balanceOf(holder)])
  const a0 = bal0.lt(want0) ? bal0 : want0
  const a1 = bal1.lt(want1) ? bal1 : want1
  return { a0, a1 }
}
function decodeFeeProtocol(fp) {
  return { fp0: fp & 0x0f, fp1: (fp >> 4) & 0x0f } // 低 4 bit 是 token0，高 4 bit 是 token1
}
async function setProtocolFee30IfNeeded(factory, poolAddr, fee, signer) {
  if (fee === 0) return
  const pool = new ethers.Contract(poolAddr, IPoolAbi, signer)
  const slot = await pool.slot0()
  const { fp0, fp1 } = decodeFeeProtocol(slot[5])
  if (fp0 === 3 && fp1 === 3) {
    console.log('   • 协议费已为 30%（3/3），跳过设置')
    return
  }
  // 只有 Factory.owner 能设
  const factoryOwner = await (new ethers.Contract(CFG.FACTORY, IFactoryAbi, signer)).owner()
  const signerAddr   = await signer.getAddress()
  if (factoryOwner.toLowerCase() !== signerAddr.toLowerCase()) {
    console.log(`⚠️ 当前 signer 不是 Factory.owner（${factoryOwner}），无法在 Pool 上设协议费`)
    return
  }
  await (await pool.setFeeProtocol(3, 3)).wait()
  console.log('   • 已在 Pool 上设置协议费为 30% (3/3)')
}

async function main() {
  // signer
  const provider = ethers.provider
  let [deployer, maybeTrader] = await ethers.getSigners()
  if (PRIVATE_KEY)       deployer = new ethers.Wallet(PRIVATE_KEY, provider)
  const trader = TRADER_PRIVATE_KEY
    ? new ethers.Wallet(TRADER_PRIVATE_KEY, provider)
    : (maybeTrader || deployer)

  console.log('👤 deployer:', deployer.address)
  console.log('👤 trader  :', trader.address)

  if (!CFG.TOKEN0 || !CFG.TOKEN1) {
    throw new Error('请在 CFG.TOKEN0/TOKEN1 写入代币地址')
  }

  // periphery
  const router = (await ethers.getContractFactory(ROUTER_NAME)).attach(CFG.SWAP_ROUTER)
  const npm    = (await ethers.getContractFactory(NPM_NAME)).attach(CFG.NPM)

  // core
  const factory = new ethers.Contract(CFG.FACTORY, IFactoryAbi, deployer)

  // 代币（deployer / trader 视角）
  const token0D = await erc20At(CFG.TOKEN0, deployer)
  const token1D = await erc20At(CFG.TOKEN1, deployer)

  // —— 授权（非常关键，否则 NPM.mint 会 STF）——
  // await approveMax(token0D, deployer, CFG.NPM,         'NPM(token0)')
  // await approveMax(token1D, deployer, CFG.NPM,         'NPM(token1)')
  // await approveMax(token0D, deployer, CFG.SWAP_ROUTER, 'Router(token0)')
  // await approveMax(token1D, deployer, CFG.SWAP_ROUTER, 'Router(token1)')

  // // 如需 trader 参与 swap，可按需分币并给 router 授权
  // await fundTraderByTransfer(token0D, await trader.getAddress(), CFG.FUND_TRADER_RATIO)
  // await fundTraderByTransfer(token1D, await trader.getAddress(), CFG.FUND_TRADER_RATIO)
  const token0T = token0D.connect(trader)
  const token1T = token1D.connect(trader)
  // await approveMax(token0T, trader, CFG.SWAP_ROUTER, 'Router(trader, token0)')
  // await approveMax(token1T, trader, CFG.SWAP_ROUTER, 'Router(trader, token1)')

  // —— 读取 decimals，组装本次用量（不要硬用 parseEther）——
  const [dec0, dec1] = await Promise.all([
    token0D.decimals().catch(() => 18),
    token1D.decimals().catch(() => 18),
  ])
  const LP0      = ethers.utils.parseUnits(CFG.LP_AMOUNT0, dec0)
  const LP1      = ethers.utils.parseUnits(CFG.LP_AMOUNT1, dec1)
  const SWAP_IN  = ethers.utils.parseUnits(CFG.SWAP_IN, dec0)
  // const [bal0, bal1, alw0, alw1] = await Promise.all([
  //   token0D.balanceOf(deployer.address),
  //   token1D.balanceOf(deployer.address),
  //   token0D.allowance(deployer.address, CFG.NPM),
  //   token1D.allowance(deployer.address, CFG.NPM),
  // ])
  // console.log(
  //   'balances:',
  //   `token0=${ethers.utils.formatUnits(bal0, dec0)}`,
  //   `token1=${ethers.utils.formatUnits(bal1, dec1)}`
  // )
  // console.log(
  //   'allowances→NPM:',
  //   `token0=${ethers.utils.formatUnits(alw0, dec0)}`,
  //   `token1=${ethers.utils.formatUnits(alw1, dec1)}`
  // )

  // 费率循环
  for (const fee of CFG.FEES) {
    console.log(`\n================ Fee = ${fee} ================`)

    await withRetry(`enableFeeAmount(${fee}, ?)`, async () => { await ensureFee(factory, fee) })
    await sleep(SLEEP_TX_MS)

    // 池 & 初始化
    const [T0, T1] = sortTokens(CFG.TOKEN0, CFG.TOKEN1)
    const poolAddr = await withRetry(`ensurePool(${fee})`, async () => {
      return await ensurePool(factory, T0, T1, fee, deployer)
    })
    const pool = new ethers.Contract(poolAddr, IPoolAbi, deployer)
    console.log('   • Pool =', poolAddr)
    await sleep(SLEEP_TX_MS)

    // 非 0 费率：把协议费强制设为 30%（3/3）
    await withRetry('setProtocolFee(30%)', async () => {
      await setProtocolFee30IfNeeded(factory, poolAddr, fee, deployer)
    })
    await sleep(SLEEP_TX_MS)

    // 查看当前 feeProtocol
    {
      const slot = await pool.slot0()
      const { fp0, fp1 } = decodeFeeProtocol(slot[5])
      console.log(`   • feeProtocol(token0,token1) = ${fp0}, ${fp1}`)
    }

    // 区间
    const spacing = bn(await factory.feeAmountTickSpacing(fee)).toNumber()
    const FR = fullRange(spacing)
    const CR = centeredRange(spacing, CFG.K_CONC)
    console.log(`   • tickSpacing=${spacing} | 全范围=[${FR.lower}, ${FR.upper}] | 集中=[${CR.lower}, ${CR.upper}]`)

    // 两个场景：全范围 & 集中
    const scenarios = [
      { label: '全范围', ticks: FR },
      { label: '集中',   ticks: CR },
    ]

    for (const sc of scenarios) {
      // 记录协议费（前）
      const protoBefore = await pool.protocolFees()

      // 1) mint（先 callStatic 再上链）
      // console.log(`   🔹 ${sc.label} → mint`)
      // await npm.connect(deployer).callStatic.mint({
      //   token0: T0, token1: T1, fee,
      //   tickLower: sc.ticks.lower, tickUpper: sc.ticks.upper,
      //   // amount0Desired: LP0, amount1Desired: LP1,
      //   amount0Min: 0, amount1Min: 0,
      //   recipient: deployer.address,
      //   deadline: nowPlus(CFG.DEADLINE_SECS),
      // }).catch((e) => {
      //   console.log('callStatic.mint revert =', e?.error?.data || e?.reason || e?.message || e)
      //   throw e
      // })
      const mintTx = await npm.connect(deployer).mint({
        token0: T0, token1: T1, fee,
        tickLower: sc.ticks.lower, tickUpper: sc.ticks.upper,
        amount0Desired: LP0, amount1Desired: LP1,
        amount0Min: 0, amount1Min: 0,
        recipient: deployer.address,
        deadline: nowPlus(CFG.DEADLINE_SECS),
      })
      const mintRc = await mintTx.wait()
      await sleep(SLEEP_TX_MS)

      const tokenId = pickTokenIdFromReceipt(mintRc)
      if (!tokenId) throw new Error(`[${sc.label}] 未拿到 tokenId`)
      const posAfterMint = await npm.positions(tokenId)
      console.log(`     • tokenId=${tokenId.toString()}, liquidity=${posAfterMint.liquidity.toString()}`)

      // 2) increaseLiquidity (+10%)
      console.log(`   🔹 ${sc.label} → increaseLiquidity (+10%)`)
      const { a0, a1 } = await pickIncreaseAmounts(token0D, token1D, deployer.address, LP0.div(10), LP1.div(10))
      if (a0.isZero() && a1.isZero()) {
        console.log('     • 可用余额为 0，跳过 increaseLiquidity')
      } else {
        await withRetry(`${sc.label} increaseLiquidity`, async () => {
          const tx = await npm.increaseLiquidity([tokenId, a0, a1, 0, 0, nowPlus(CFG.DEADLINE_SECS)])
          return await tx.wait()
        })
        const posAfterInc = await npm.positions(tokenId)
        console.log(`     • liquidity(after inc)=${posAfterInc.liquidity.toString()}`)
      }
      await sleep(SLEEP_TX_MS)

      // 3) swap (trader: token0 -> token1)
      console.log(`   🔹 ${sc.label} → swap(trader: token0→token1)`)
      await withRetry(`${sc.label} swap`, async () => {
        const tx = await router.connect(trader).exactInputSingle({
          tokenIn: CFG.TOKEN0, tokenOut: CFG.TOKEN1,
          fee,
          recipient: trader.address,
          deadline: nowPlus(CFG.DEADLINE_SECS),
          amountIn: SWAP_IN,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        })
        return await tx.wait()
      })
      await sleep(SLEEP_TX_MS)

      // 记录协议费（后）
      const protoAfter = await pool.protocolFees()
      console.log(
        `     • 协议费累计：Δtoken0=${protoAfter.token0.sub(protoBefore.token0).toString()}  Δtoken1=${protoAfter.token1.sub(protoBefore.token1).toString()}`
      )

      // 4) decrease + collect（50%）
      console.log(`   🔹 ${sc.label} → decreaseLiquidity + collect`)
      const [before0, before1] = await Promise.all([
        token0D.balanceOf(deployer.address),
        token1D.balanceOf(deployer.address),
      ])
      const liqNow = (await npm.positions(tokenId)).liquidity
      if (liqNow.isZero()) {
        console.log('     • 流动性为 0，跳过')
      } else {
        const half = liqNow.div(2)
        await withRetry(`${sc.label} decreaseLiquidity`, async () => {
          const tx = await npm.decreaseLiquidity([tokenId, half, 0, 0, nowPlus(CFG.DEADLINE_SECS)])
          return await tx.wait()
        })
        await sleep(SLEEP_TX_MS)

        await withRetry(`${sc.label} collect`, async () => {
          const tx = await npm.collect([tokenId, deployer.address, MAX128, MAX128])
          return await tx.wait()
        })
        await sleep(SLEEP_TX_MS)

        const [after0, after1] = await Promise.all([
          token0D.balanceOf(deployer.address),
          token1D.balanceOf(deployer.address),
        ])
        console.log(`     • LP 收益：Δtoken0=${after0.sub(before0).toString()}  Δtoken1=${after1.sub(before1).toString()}`)
      }
    }

    // 协议费（非 0 费）
    if (fee > 0) {
      console.log('   🔹 collectProtocol（协议费）')
      const [b0, b1] = await Promise.all([
        token0D.balanceOf(deployer.address),
        token1D.balanceOf(deployer.address),
      ])
      await withRetry('collectProtocol', async () => {
        const tx = await pool.collectProtocol(deployer.address, MAX128, MAX128)
        return await tx.wait()
      }).catch((e) => {
        console.log('     • collectProtocol 失败（可能 signer 不是 Factory.owner）：', e?.reason || e?.message || e)
      })
      await sleep(SLEEP_TX_MS)
      const [a0, a1] = await Promise.all([
        token0D.balanceOf(deployer.address),
        token1D.balanceOf(deployer.address),
      ])
      console.log(`     • 协议费入账：Δtoken0=${a0.sub(b0).toString()}  Δtoken1=${a1.sub(b1).toString()}`)
    } else {
      console.log('   • 0 费率池，预期无协议费')
    }

    await sleep(SLEEP_FEE_MS)
  }

  console.log('\n🎉 全部费率（全范围 + 集中 + increaseLiquidity + 协议费提取）测试完成')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
