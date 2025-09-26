// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;

interface ISlerfSwapV3PoolDeployer {
    struct Parameters {
        address factory;
        address token0;
        address token1;
        uint24 fee;
        int24 tickSpacing;
    }

    /// @notice For the Pool constructor to read deployment parameters (the struct getter returns a tuple in field order)
    function parameters()
        external
        view
        returns (
            address factory,
            address token0,
            address token1,
            uint24 fee,
            int24 tickSpacing
        );

    /// @notice Called by the Factory to deploy a new pool via CREATE2
    function deployPool(
        address factory,
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing
    ) external returns (address pool);

    /// @notice For scripts/frontends: return the keccak256 of the Pool creation code
    function poolInitCodeHash() external pure returns (bytes32);
}
