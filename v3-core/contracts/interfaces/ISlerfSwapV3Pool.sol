// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './pool/ISlerfSwapV3PoolImmutables.sol';
import './pool/ISlerfSwapV3PoolState.sol';
import './pool/ISlerfSwapV3PoolDerivedState.sol';
import './pool/ISlerfSwapV3PoolActions.sol';
import './pool/ISlerfSwapV3PoolOwnerActions.sol';
import './pool/ISlerfSwapV3PoolEvents.sol';

/// @title The interface for a Uniswap V3 Pool
/// @notice A Uniswap pool facilitates swapping and automated market making between any two assets that strictly conform
/// to the ERC20 specification
/// @dev The pool interface is broken up into many smaller pieces
interface ISlerfSwapV3Pool is
    ISlerfSwapV3PoolImmutables,
    ISlerfSwapV3PoolState,
    ISlerfSwapV3PoolDerivedState,
    ISlerfSwapV3PoolActions,
    ISlerfSwapV3PoolOwnerActions,
    ISlerfSwapV3PoolEvents
{

}
