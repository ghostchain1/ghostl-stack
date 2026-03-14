// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (interfaces/IGRC5805.sol)

pragma solidity >=0.8.4;

import {IVotes} from "../governance/utils/IVotes.sol";
import {IGRC6372} from "./IGRC6372.sol";

interface IGRC5805 is IGRC6372, IVotes {}
