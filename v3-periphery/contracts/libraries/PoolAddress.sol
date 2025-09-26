// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

/// @title Helpers for computing pool addresses (SlerfSwap variant)
/// @dev This version uses an external PoolDeployer as the CREATE2 deployer (Option B).
library PoolAddress {
    // ========= REQUIRED: replace with your own on-chain addresses/hashes =========
    // External PoolDeployer (the contract address that deploys SlerfSwapV3Pool)
    address internal constant POOL_DEPLOYER = 0x7426F5fc3aBB2286A7848bf1387458D7ae7cE9c9;
    // init code hash of SlerfSwapV3Pool (read via poolDeployer.poolInitCodeHash() or compute locally and paste)
    bytes32 internal constant POOL_INIT_CODE_HASH =
        0x0ae75198b494ad1f1b0510036c21aad5e3f8647d8260c8e1b941c3b1101573ed;
    // ================================================

    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    // Return sorted token0/token1 (ascending by address) + fee
    function getPoolKey(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal pure returns (PoolKey memory key) {
        require(tokenA != tokenB, "PA: IDENTICAL");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "PA: ZERO");
        key = PoolKey({token0: token0, token1: token1, fee: fee});
    }

    // Compute the pool address (based on the external PoolDeployer's CREATE2 formula)
    // address = keccak256(0xff ++ POOL_DEPLOYER ++ keccak256(abi.encode(token0,token1,fee)) ++ POOL_INIT_CODE_HASH)[12:]
    function computeAddress(address /*factory*/, PoolKey memory key) internal pure returns (address pool) {
        bytes32 salt = keccak256(abi.encode(key.token0, key.token1, key.fee));
        pool = address(
            uint160(
                uint(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), POOL_DEPLOYER, salt, POOL_INIT_CODE_HASH)
                    )
                )
            )
        );
    }
}
