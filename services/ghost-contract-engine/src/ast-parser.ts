/**
 * AST Parser
 *
 * Thin wrapper around @solidity-parser/parser that extracts structured
 * information (contract names, function names, modifiers) from a Solidity
 * source string.  The raw AST is never exposed outside this module.
 */

import { parse } from "@solidity-parser/parser";

// Minimal local types for the AST nodes we use (the package's main index
// does not re-export these from its ast-types module).
interface ASTNodeBase { type: string; }
interface ParamNode { typeName?: { namePath?: string; name?: string } }
interface FunctionDefinitionNode extends ASTNodeBase {
  name: string | null;
  isConstructor: boolean;
  visibility: string | null;
  stateMutability: string | null;
  parameters: ParamNode[] | null;
  returnParameters: ParamNode[] | null;
  subNodes?: never;
}
interface InheritanceNode { baseName: { namePath: string } }
interface ContractDefinitionNode extends ASTNodeBase {
  kind: string;
  name: string;
  subNodes: ASTNodeBase[];
  baseContracts: InheritanceNode[];
}

export interface FunctionInfo {
  name: string;
  visibility: string;
  stateMutability: string;
  isConstructor: boolean;
  parameters: string[];
  returnParameters: string[];
}

export interface ContractInfo {
  name: string;
  kind: "contract" | "library" | "interface";
  baseContracts: string[];
  functions: FunctionInfo[];
}

export interface ParseResult {
  contracts: ContractInfo[];
  /** Names of all functions across all contracts in the file (flat, deduped) */
  allFunctionNames: Set<string>;
}

/**
 * Parse `source` and return structured contract/function information.
 * Returns `null` on unrecoverable parse error (logged to stderr, not thrown).
 */
export function parseContract(source: string, filePath = "<unknown>"): ParseResult | null {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, { tolerant: true, loc: true });
  } catch (err) {
    process.stderr.write(`[ast-parser] Failed to parse ${filePath}: ${String(err)}\n`);
    return null;
  }

  const contracts: ContractInfo[] = [];

  for (const node of ast.children as ASTNodeBase[]) {
    if (node.type !== "ContractDefinition") continue;
    const cd = node as ContractDefinitionNode;

    const functions: FunctionInfo[] = [];

    for (const subNode of cd.subNodes) {
      if (subNode.type !== "FunctionDefinition") continue;
      const fd = subNode as FunctionDefinitionNode;

      // The parser sets name=null for constructors/fallbacks.
      const fnName = fd.name ?? (fd.isConstructor ? "<constructor>" : "<fallback/receive>");

      functions.push({
        name: fnName,
        visibility: fd.visibility ?? "internal",
        stateMutability: fd.stateMutability ?? "nonpayable",
        isConstructor: fd.isConstructor ?? false,
        parameters: (fd.parameters ?? []).map((p) =>
          p.typeName?.namePath ?? p.typeName?.name ?? "unknown"
        ),
        returnParameters: (fd.returnParameters ?? []).map((p) =>
          p.typeName?.namePath ?? p.typeName?.name ?? "unknown"
        ),
      });
    }

    contracts.push({
      name: cd.name,
      kind: cd.kind as ContractInfo["kind"],
      baseContracts: cd.baseContracts.map((bc) => bc.baseName.namePath),
      functions,
    });
  }

  const allFunctionNames = new Set(
    contracts.flatMap((c) => c.functions.map((f) => f.name)),
  );

  return { contracts, allFunctionNames };
}
