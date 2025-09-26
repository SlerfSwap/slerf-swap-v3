// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.7.6;

import './interfaces/ISlerfSwapV3PoolDeployer.sol';
import './SlerfSwapV3Pool.sol';

contract SlerfSwapV3PoolDeployer is ISlerfSwapV3PoolDeployer {
    /// @dev Used to read deployment parameters in the Pool constructor (same pattern as Uniswap V3)
    Parameters public override parameters;

    event PoolDeployed(
        address indexed pool,
        address indexed factory,
        address indexed token0,
        address token1,
        uint24 fee,
        int24 tickSpacing
    );

    /// @notice Callable only by the Factory; deploy a pool via CREATE2
    function deployPool(
        address factory,
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing
    ) external override returns (address pool) {
        require(factory != address(0), 'no-factory');
        // Only the real Factory is allowed to call (prevents outsiders from deploying pools by forging parameters)
        require(msg.sender == factory, 'only-factory');

        parameters = Parameters({factory: factory, token0: token0, token1: token1, fee: fee, tickSpacing: tickSpacing});

        pool = address(new SlerfSwapV3Pool{salt: keccak256(abi.encode(token0, token1, fee))}());

        emit PoolDeployed(pool, factory, token0, token1, fee, tickSpacing);

        // Clear temporary parameters to save subsequent SLOADs
        delete parameters;
    }

    /// @notice Let scripts fetch the init code hash from chain to match this contract
    function poolInitCodeHash() external pure override returns (bytes32) {
        return keccak256(type(SlerfSwapV3Pool).creationCode);
    }
}
