/**
 * nft-generator.ts — GRC-721 NFT contract generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 GRC-721 NFT that:
 *   - Inherits from ../ghost/GRC721.sol (GhostChain Contracts v5.6.1)
 *   - Sequential tokenId auto-increment starting at 1
 *   - Owner-restricted mint
 *   - Token-owner burn (or approved)
 *   - tokenURI with configurable base URI
 *   - Optional max supply cap
 *   - Optional EIP-2981-style royalty (GhostChain compliant)
 */

import {
  GHOST_SPDX_MIT,
  GHOST_PRAGMA,
  ghostContractHeader,
  namedImport,
  natspec,
  solidityFile,
} from "./ast-builder.js";

export interface NftOptions {
  /** Solidity contract name, e.g. "GhostAvatars" */
  name: string;
  /** Human-readable collection name, e.g. "Ghost Avatars" */
  collectionName: string;
  /** Collection symbol, e.g. "GAVT" */
  symbol: string;
  /**
   * Base URI for token metadata, e.g. "https://gns.ghost/avatars/".
   * tokenURI returns baseURI + tokenId + ".json".
   */
  baseUri?: string;
  /** Maximum tokens that can be minted. Omit for uncapped. */
  maxSupply?: number;
  /**
   * Royalty in basis points (e.g. 500 = 5%).
   * Omit to disable royalty.
   */
  royaltyBps?: number;
  /** Royalty recipient address expression (default "owner") */
  royaltyRecipient?: string;
  /** Relative path from the generated file to contracts/src/ghost/ (default "../ghost") */
  ghostImportBase?: string;
}

/**
 * Generates a GRC-721 NFT contract source string.
 *
 * @param opts       Generator options
 * @param outputPath Workspace-relative destination, used in the header comment.
 */
export function generateNft(opts: NftOptions, outputPath: string): string {
  const baseUri    = opts.baseUri ?? "";
  const ghostBase  = opts.ghostImportBase ?? "../ghost";
  const royaltyBps = opts.royaltyBps ?? 0;

  const imports = namedImport(["GRC721"], `${ghostBase}/GRC721.sol`);

  // ── state variables ──
  const stateVars: string[] = [
    `address public owner;`,
    `uint256 private _nextTokenId;`,
  ];
  if (baseUri) {
    stateVars.push(`string  private _baseUri;`);
  }
  if (opts.maxSupply) {
    stateVars.push(`uint256 public constant MAX_SUPPLY = ${opts.maxSupply};`);
  }
  if (royaltyBps > 0) {
    stateVars.push(`uint256 public constant ROYALTY_BPS = ${royaltyBps};`);
    if (opts.royaltyRecipient && opts.royaltyRecipient !== "owner") {
      stateVars.push(
        `address public royaltyRecipient = ${opts.royaltyRecipient};`,
      );
    }
  }

  // ── events ──
  const eventsBlock = `event OwnershipTransferred(address indexed from, address indexed to);`;

  // ── errors ──
  const errors: string[] = [
    `error NotOwner();`,
    `error NotApprovedOrOwner();`,
    ...(opts.maxSupply ? [`error MaxSupplyReached();`] : []),
  ];

  // ── modifiers ──
  const modOnlyOwner =
    `modifier onlyOwner() {\n        if (msg.sender != owner) revert NotOwner();\n        _;\n    }`;

  // ── constructor ──
  const baseUriArg  = baseUri ? `,\n        string memory baseUri_` : "";
  const baseUriInit = baseUri ? `\n        _baseUri = baseUri_;` : "";
  const ctor = `constructor(\n        string memory _name,\n        string memory _symbol,\n        address initialOwner${baseUriArg}\n    ) GRC721(_name, _symbol) {\n        owner        = initialOwner;\n        _nextTokenId = 1;${baseUriInit}\n    }`;

  // ── tokenURI ──
  const tokenURIBody = baseUri
    ? `require(_exists(tokenId), "GRC721: URI query for nonexistent token");\n        return string(abi.encodePacked(_baseUri, _toString(tokenId), ".json"));`
    : `require(_exists(tokenId), "GRC721: URI query for nonexistent token");\n        return "";`;

  const toStringFn = `function _toString(uint256 value) internal pure returns (string memory) {\n        if (value == 0) return "0";\n        uint256 temp  = value;\n        uint256 digits;\n        while (temp != 0) { unchecked { digits++; temp /= 10; } }\n        bytes memory buf = new bytes(digits);\n        while (value != 0) {\n            unchecked {\n                digits--;\n                buf[digits] = bytes1(uint8(48 + value % 10));\n                value /= 10;\n            }\n        }\n        return string(buf);\n    }`;

  // ── mint ──
  const maxCapCheck = opts.maxSupply
    ? `if (_nextTokenId > MAX_SUPPLY) revert MaxSupplyReached();\n        `
    : "";
  const mintFn = `/// @notice Mints the next token to \`to\`. Restricted to root.
    function mint(address to) external onlyOwner returns (uint256 tokenId) {\n        tokenId = _nextTokenId;\n        ${maxCapCheck}_mint(to, tokenId);\n        unchecked { _nextTokenId++; }\n    }`;

  // ── burn ──
  const burnFn = `/// @notice Burns \`tokenId\`. Caller must be the owner or approved.
    function burn(uint256 tokenId) external {\n        address tok = _owners[tokenId];\n        require(tok != address(0), "GRC721: token does not exist");\n        bool approved =\n            msg.sender == tok ||\n            _operatorApprovals[tok][msg.sender] ||\n            _tokenApprovals[tokenId] == msg.sender;\n        if (!approved) revert NotApprovedOrOwner();\n        _burn(tokenId);\n    }`;

  // ── royaltyInfo ──
  const royaltyFn =
    royaltyBps > 0
      ? `/// @notice EIP-2981 royalty info — GhostChain-compliant.
    function royaltyInfo(uint256 /*tokenId*/, uint256 salePrice)\n        external\n        view\n        returns (address receiver, uint256 royaltyAmount)\n    {\n        receiver      = ${opts.royaltyRecipient && opts.royaltyRecipient !== "owner" ? "royaltyRecipient" : "owner"};\n        royaltyAmount = (salePrice * ROYALTY_BPS) / 10_000;\n    }`
      : "";

  // ── setBaseUri ──
  const setBaseUriFn = baseUri
    ? `function setBaseUri(string memory newUri) external onlyOwner {\n        _baseUri = newUri;\n    }`
    : "";

  // ── transferOwnership ──
  const ownerFn = `function transferOwnership(address to) external onlyOwner {\n        require(to != address(0), "${opts.name}: zero address");\n        emit OwnershipTransferred(owner, to);\n        owner = to;\n    }`;

  const functions = [
    `function tokenURI(uint256 tokenId) public view override returns (string memory) {\n        ${tokenURIBody}\n    }`,
    mintFn,
    burnFn,
    ...(royaltyFn ? [royaltyFn] : []),
    ...(setBaseUriFn ? [setBaseUriFn] : []),
    ownerFn,
    toStringFn,
  ];

  const contractBody = [
    `    // ── State ─────────────────────────────────────────────────────────────────\n\n    ${stateVars.join("\n    ")}`,
    `    // ── Events ────────────────────────────────────────────────────────────────\n\n    ${eventsBlock}`,
    `    // ── Errors ────────────────────────────────────────────────────────────────\n\n    ${errors.join("\n    ")}`,
    `    // ── Modifiers ────────────────────────────────────────────────────────────\n\n    ${modOnlyOwner}`,
    `    // ── Constructor ──────────────────────────────────────────────────────────\n\n    ${ctor}`,
    `    // ── External / Public ─────────────────────────────────────────────────────\n\n    ${functions.join("\n\n    ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const doc = natspec({
    title: `${opts.name} — ${opts.collectionName} GRC-721 NFT`,
    notice: `GhostChain NFT collection. Symbol: ${opts.symbol}.`,
    dev: [
      "Inherits GRC721 (GhostChain Contracts v5.6.1).",
      "Sequential tokenId starting at 1.",
      opts.maxSupply ? `Max supply: ${opts.maxSupply}.` : "",
      royaltyBps > 0 ? `Royalty: ${royaltyBps} bps.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  });

  const contractDecl = `${doc}\ncontract ${opts.name} is GRC721 {\n${contractBody}\n}`;

  return solidityFile([
    GHOST_SPDX_MIT,
    GHOST_PRAGMA,
    ghostContractHeader(outputPath),
    imports,
    contractDecl,
  ]);
}
