// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;

import "./interfaces/ISlerfSwapV3Factory.sol";
import "./interfaces/ISlerfSwapV3Pool.sol";
import "./interfaces/ISlerfSwapV3PoolDeployer.sol";
import "./NoDelegateCall.sol";

contract SlerfSwapV3Factory is ISlerfSwapV3Factory, NoDelegateCall {
    address public override owner;
    address public immutable poolDeployer;

    // fee → tickSpacing
    mapping(uint24 => int24) public override feeAmountTickSpacing;
    // tokenA → tokenB → fee → pool
    mapping(address => mapping(address => mapping(uint24 => address))) public override getPool;

    /// @dev New event: record that non‑zero fee pools fix a 30% protocol fee at creation
    event ProtocolFeeAutoEnabled(address indexed pool, address indexed token0, address indexed token1, uint24 fee, uint8 pct);

    constructor(address _poolDeployer) {
        owner = msg.sender;
        poolDeployer = _poolDeployer;
        emit OwnerChanged(address(0), msg.sender);
    }

    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external override noDelegateCall returns (address pool) {
        require(tokenA != tokenB, "same token");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "zero token");

        int24 tickSpacing = feeAmountTickSpacing[fee];
        require(tickSpacing != 0, "fee disabled");
        require(getPool[token0][token1][fee] == address(0), "pool exists");

        // Deployed by PoolDeployer via CREATE2
        pool = ISlerfSwapV3PoolDeployer(poolDeployer).deployPool(address(this), token0, token1, fee, tickSpacing);

        // Bidirectional mapping
        getPool[token0][token1][fee] = pool;
        getPool[token1][token0][fee] = pool;

        emit PoolCreated(token0, token1, fee, tickSpacing, pool);

        // Option 3: except for the 0‑fee tier, Pool.initialize() already sets feeProtocol to 0x33 (30%) internally
        if (fee > 0) {
            emit ProtocolFeeAutoEnabled(pool, token0, token1, fee, 30);
        }
    }

    function setOwner(address _owner) external override {
        require(msg.sender == owner, "not owner");
        emit OwnerChanged(owner, _owner);
        owner = _owner;
    }

    function enableFeeAmount(uint24 fee, int24 tickSpacing) public override {
        require(msg.sender == owner, "not owner");
        require(fee < 1_000_000, "fee too large");
        require(tickSpacing > 0 && tickSpacing < 16384, "invalid spacing");
        require(feeAmountTickSpacing[fee] == 0, "fee-already-enabled");
        feeAmountTickSpacing[fee] = tickSpacing;
        emit FeeAmountEnabled(fee, tickSpacing);
    }

    /**
     * @notice Compatibility with old scripts: pools now automatically enable a 30% protocol fee for non‑zero fee tiers in initialize().
     *         To remain backward compatible, we no longer call Pool.setFeeProtocol (only Factory.owner can call it directly).
     *         Here we expose a no‑op callable by the owner and emit an event to avoid script failures.
     */
    function setPoolProtocolFee(address token0, address token1, uint24 fee) external {
        require(msg.sender == owner, "not owner");
        address pool = getPool[token0][token1][fee];
        require(pool != address(0), "pool not found");

        // No longer writing to the pool proactively: for non‑zero fee tiers, Pool.initialize() already fixes the protocol fee share at 30% (0x33).
        // Only emit an event here to indicate the pool follows "Option 3: fixed 30% protocol fee".
        if (fee > 0) {
            emit ProtocolFeeAutoEnabled(pool, token0, token1, fee, 30);
        }
    }
}
