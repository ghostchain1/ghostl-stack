// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library LibErrors {
    error NotOwner();
    error ZeroAddress();
    error NotAuthorized();
    error AlreadyRelayed();
    error InvalidTarget();
    error InvalidValue();
}
