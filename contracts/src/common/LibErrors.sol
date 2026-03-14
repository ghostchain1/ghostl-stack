// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library LibErrors {
    error NotOwner();
    error ZeroAddress();
    error NotAuthorized();
    error AlreadyRelayed();
    error InvalidTarget();
    error InvalidValue();
}
