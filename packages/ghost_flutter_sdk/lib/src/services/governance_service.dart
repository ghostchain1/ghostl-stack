import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:web3dart/web3dart.dart';
import '../ghost_wallet.dart';

/// GhostGovernanceService — on-chain governance for GhostChain.
///
/// Targets GhostChain L1 (chain ID 14000101, RPC :18545).
/// Governance happens at L1 — the sovereign layer. L3/L2 users read proposals
/// from L1 and vote via the relay at the signing relay (port 7910).
///
/// AI may **draft** proposals; humans must **ratify** them via governance quorum.
/// This service never executes proposals autonomously — it only submits them
/// to the signing relay or casts votes.
///
/// ```dart
/// final gov = GhostGovernanceService();
///
/// // Read all proposals
/// final proposals = await gov.getProposals();
///
/// // Vote (requires L1 wallet)
/// await gov.vote(
///   proposalId: '42',
///   support: true,
///   wallet: l1Wallet,
/// );
/// ```
class GhostGovernanceService {
  final String _l1Rpc;
  final String _signingRelayUrl;

  /// GhostChain L1 chain ID.
  static const int l1ChainId = 14000101;

  /// GhostChainGovernor address on L1 (set by governance deployment).
  static const String governorAddress = '0x0000000000000000000000000000000000000000';

  /// Signing relay for advisory proposals (port 7910).
  static const String defaultSigningRelay = 'http://localhost:7910';

  GhostGovernanceService({
    String? l1Rpc,
    String? signingRelayUrl,
  })  : _l1Rpc = l1Rpc ?? 'http://localhost:18545',
        _signingRelayUrl = signingRelayUrl ?? defaultSigningRelay;

  // ── Proposal Queries ──────────────────────────────────────────────────────

  /// Fetch all governance proposals from the signing relay (indexed off-chain).
  Future<List<GhostProposal>> getProposals({ProposalState? state}) async {
    final query = state != null ? '?state=${state.name}' : '';
    final res = await http.get(
      Uri.parse('$_signingRelayUrl/proposals$query'),
      headers: {'Content-Type': 'application/json'},
    );
    if (res.statusCode != 200) {
      throw Exception('GhostGovernanceService.getProposals failed [${res.statusCode}]');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    final list = data['proposals'] as List<dynamic>? ?? [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(GhostProposal.fromJson)
        .toList();
  }

  /// Fetch a single proposal by ID.
  Future<GhostProposal?> getProposal(String proposalId) async {
    final res = await http.get(
      Uri.parse('$_signingRelayUrl/proposals/$proposalId'),
      headers: {'Content-Type': 'application/json'},
    );
    if (res.statusCode == 404) return null;
    if (res.statusCode != 200) {
      throw Exception('GhostGovernanceService.getProposal failed [${res.statusCode}]');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return GhostProposal.fromJson(data['proposal'] as Map<String, dynamic>? ?? data);
  }

  /// Get on-chain proposal state from GhostChainGovernor (L1).
  ///
  /// Calls `ghost_call` → `state(uint256 proposalId)` on the governor contract.
  Future<ProposalState> getProposalState(String proposalId) async {
    final id = BigInt.tryParse(proposalId);
    if (id == null) return ProposalState.unknown;

    final calldata = _encodeStateCall(id);
    final payload = _rpcPayload('ghost_call', [
      {'to': governorAddress, 'data': calldata},
      'latest',
    ]);
    final res = await _postL1(payload);
    final hex = res['result'] as String? ?? '0x';
    if (hex.length < 2) return ProposalState.unknown;
    final stateInt = int.tryParse(hex.replaceFirst('0x', ''), radix: 16) ?? -1;
    return ProposalState.fromInt(stateInt);
  }

  // ── Voting ────────────────────────────────────────────────────────────────

  /// Cast a vote on a proposal via the signing relay.
  ///
  /// The relay batches votes and submits them to L1 within the voting window.
  /// [support] = true  → FOR
  /// [support] = false → AGAINST
  ///
  /// Returns the relay submission receipt identifier.
  Future<String> vote({
    required String proposalId,
    required bool support,
    required GhostWallet wallet,
    String? reason,
  }) async {
    // Sign a vote intent message locally (EIP-712-style, GhostChain variant).
    final message = _buildVoteMessage(proposalId, support, wallet.address.hex, reason);
    final msgBytes = _utf8Bytes(json.encode(message));
    final sig = await wallet.credentials.sign(msgBytes);
    final sigHex = '0x${sig.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';

    final res = await http.post(
      Uri.parse('$_signingRelayUrl/votes'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'proposalId': proposalId,
        'support': support,
        'voter': wallet.address.hex,
        'reason': reason,
        'signature': sigHex,
        'message': message,
      }),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('GhostGovernanceService.vote relay submission failed [${res.statusCode}]: ${res.body}');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['receiptId'] as String? ?? '';
  }

  /// Cast a vote directly on-chain (L1). Requires an L1 private key.
  ///
  /// This calls `castVote(uint256 proposalId, uint8 support)` on the governor.
  Future<String> voteOnChain({
    required String proposalId,
    required bool support,
    required String l1PrivateKey,
    String? reason,
  }) async {
    final l1Client = Web3Client(_l1Rpc, http.Client());
    try {
      final key = EthPrivateKey.fromHex(
        l1PrivateKey.startsWith('0x') ? l1PrivateKey.substring(2) : l1PrivateKey,
      );
      final id = BigInt.tryParse(proposalId) ?? BigInt.zero;
      final calldata = reason != null
          ? _encodeCastVoteWithReason(id, support, reason)
          : _encodeCastVote(id, support);
      final nonce = await l1Client.getTransactionCount(key.address);
      final tx = Transaction(
        from: key.address,
        to: EthereumAddress.fromHex(governorAddress),
        value: EtherAmount.zero(),
        data: calldata,
        nonce: nonce,
        maxGas: 120000,
      );
      final signed = await l1Client.signTransaction(key, tx, chainId: l1ChainId);
      return await l1Client.sendRawTransaction(signed);
    } finally {
      l1Client.dispose();
    }
  }

  // ── Proposal Submission ───────────────────────────────────────────────────

  /// Submit an advisory proposal to the signing relay for human ratification.
  ///
  /// Per the GhostChain governance model: AI may draft, humans must ratify.
  /// This method submits the proposal to the relay — it is NOT executed on-chain
  /// until governance quorum is reached and a human ratifier triggers execution.
  ///
  /// Returns the relay-assigned proposal ID.
  Future<String> submitAdvisoryProposal({
    required String title,
    required String description,
    required GhostWallet wallet,
    String? targetContractAddress,
    String? calldataHex,
    BigInt? gstValue,
  }) async {
    final message = {
      'title': title,
      'description': description,
      'proposer': wallet.address.hex,
      'targetContract': targetContractAddress,
      'calldata': calldataHex,
      'gstValue': gstValue?.toString() ?? '0',
      'timestamp': DateTime.now().millisecondsSinceEpoch,
    };

    final msgBytes = _utf8Bytes(json.encode(message));
    final sig = await wallet.credentials.sign(msgBytes);
    final sigHex = '0x${sig.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';

    final res = await http.post(
      Uri.parse('$_signingRelayUrl/proposals'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({'proposal': message, 'signature': sigHex}),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('GhostGovernanceService.submitAdvisoryProposal failed [${res.statusCode}]: ${res.body}');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['proposalId'] as String? ?? '';
  }

  // ── Delegation ────────────────────────────────────────────────────────────

  /// Get the voting power for an address at the current block.
  Future<BigInt> getVotes(String address) async {
    final calldata = _encodeGetVotes(address);
    final payload = _rpcPayload('ghost_call', [
      {'to': governorAddress, 'data': calldata},
      'latest',
    ]);
    final res = await _postL1(payload);
    final hex = res['result'] as String? ?? '0x0';
    return BigInt.tryParse(hex.replaceFirst('0x', ''), radix: 16) ?? BigInt.zero;
  }

  /// Delegate voting power to [delegatee]. Requires L1 wallet.
  Future<String> delegate({
    required String delegatee,
    required String l1PrivateKey,
  }) async {
    final l1Client = Web3Client(_l1Rpc, http.Client());
    try {
      final key = EthPrivateKey.fromHex(
        l1PrivateKey.startsWith('0x') ? l1PrivateKey.substring(2) : l1PrivateKey,
      );
      final calldata = _encodeDelegate(delegatee);
      final nonce = await l1Client.getTransactionCount(key.address);
      final tx = Transaction(
        from: key.address,
        to: EthereumAddress.fromHex(governorAddress),
        value: EtherAmount.zero(),
        data: calldata,
        nonce: nonce,
        maxGas: 80000,
      );
      final signed = await l1Client.signTransaction(key, tx, chainId: l1ChainId);
      return await l1Client.sendRawTransaction(signed);
    } finally {
      l1Client.dispose();
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> _postL1(Map<String, dynamic> payload) async {
    final res = await http.post(
      Uri.parse(_l1Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(payload),
    );
    if (res.statusCode != 200) {
      throw Exception('GhostGovernanceService L1 RPC error [${res.statusCode}]');
    }
    final decoded = json.decode(res.body) as Map<String, dynamic>;
    if (decoded.containsKey('error')) {
      throw Exception('GhostGovernanceService L1 RPC error: ${decoded['error']}');
    }
    return decoded;
  }

  Map<String, dynamic> _rpcPayload(String method, List<dynamic> params) => {
        'jsonrpc': '2.0',
        'id': 1,
        'method': method,
        'params': params,
      };

  Map<String, dynamic> _buildVoteMessage(
    String proposalId,
    bool support,
    String voter,
    String? reason,
  ) =>
      {
        'type': 'ghost_vote',
        'proposalId': proposalId,
        'support': support ? 1 : 0,
        'voter': voter,
        if (reason != null) 'reason': reason,
        'chainId': l1ChainId,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      };

  // ── ABI encoding ──────────────────────────────────────────────────────────

  /// state(uint256) → selector 0x3e4f49e6
  Uint8List _encodeStateCall(BigInt proposalId) {
    const selector = '3e4f49e6';
    final id = proposalId.toRadixString(16).padLeft(64, '0');
    return _hexToBytes('$selector$id');
  }

  /// castVote(uint256 proposalId, uint8 support) → selector 0x56781388
  Uint8List _encodeCastVote(BigInt proposalId, bool support) {
    const selector = '56781388';
    final id = proposalId.toRadixString(16).padLeft(64, '0');
    final s = (support ? 1 : 0).toRadixString(16).padLeft(64, '0');
    return _hexToBytes('$selector$id$s');
  }

  /// castVoteWithReason(uint256, uint8, string) → selector 0x7b3c71d3
  Uint8List _encodeCastVoteWithReason(BigInt proposalId, bool support, String reason) {
    const selector = '7b3c71d3';
    final id = proposalId.toRadixString(16).padLeft(64, '0');
    final s = (support ? 1 : 0).toRadixString(16).padLeft(64, '0');
    const strOffset = '0000000000000000000000000000000000000000000000000000000000000060';
    final reasonBytes = _utf8Bytes(reason);
    final length = reasonBytes.length.toRadixString(16).padLeft(64, '0');
    final pad = reasonBytes.length % 32 == 0 ? 0 : 32 - (reasonBytes.length % 32);
    final data = [...reasonBytes, ...List.filled(pad, 0)];
    final dataHex = data.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return _hexToBytes('$selector$id$s$strOffset$length$dataHex');
  }

  /// getVotes(address account) → selector 0xeb9019d4
  Uint8List _encodeGetVotes(String address) {
    const selector = 'eb9019d4';
    final addr = address.replaceFirst('0x', '').toLowerCase().padLeft(64, '0');
    return _hexToBytes('$selector$addr');
  }

  /// delegate(address delegatee) → selector 0x5c19a95c
  Uint8List _encodeDelegate(String delegatee) {
    const selector = '5c19a95c';
    final addr = delegatee.replaceFirst('0x', '').toLowerCase().padLeft(64, '0');
    return _hexToBytes('$selector$addr');
  }

  Uint8List _hexToBytes(String hex) {
    final clean = hex.startsWith('0x') ? hex.substring(2) : hex;
    final result = Uint8List(clean.length ~/ 2);
    for (var i = 0; i < result.length; i++) {
      result[i] = int.parse(clean.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return result;
  }

  List<int> _utf8Bytes(String s) => s.codeUnits;
}

// ── Models ─────────────────────────────────────────────────────────────────────

enum ProposalState {
  pending,
  active,
  canceled,
  defeated,
  succeeded,
  queued,
  expired,
  executed,
  unknown;

  static ProposalState fromInt(int i) {
    if (i < 0 || i > 7) return ProposalState.unknown;
    return ProposalState.values[i];
  }
}

class GhostProposal {
  final String proposalId;
  final String title;
  final String description;
  final String proposer;
  final ProposalState state;
  final BigInt forVotes;
  final BigInt againstVotes;
  final BigInt abstainVotes;
  final int startBlock;
  final int endBlock;
  final DateTime createdAt;

  const GhostProposal({
    required this.proposalId,
    required this.title,
    required this.description,
    required this.proposer,
    required this.state,
    required this.forVotes,
    required this.againstVotes,
    required this.abstainVotes,
    required this.startBlock,
    required this.endBlock,
    required this.createdAt,
  });

  bool get isPassing => forVotes > againstVotes;
  bool get isActive  => state == ProposalState.active;

  factory GhostProposal.fromJson(Map<String, dynamic> j) {
    final stateStr = j['state'] as String? ?? '';
    final stateEnum = ProposalState.values.firstWhere(
      (s) => s.name == stateStr,
      orElse: () => ProposalState.unknown,
    );
    final ts = (j['createdAt'] as num?)?.toInt() ?? 0;
    return GhostProposal(
      proposalId:   j['proposalId']   as String? ?? j['id'] as String? ?? '',
      title:        j['title']        as String? ?? '',
      description:  j['description']  as String? ?? '',
      proposer:     j['proposer']     as String? ?? '',
      state:        stateEnum,
      forVotes:     BigInt.tryParse(j['forVotes']?.toString()     ?? '0') ?? BigInt.zero,
      againstVotes: BigInt.tryParse(j['againstVotes']?.toString() ?? '0') ?? BigInt.zero,
      abstainVotes: BigInt.tryParse(j['abstainVotes']?.toString() ?? '0') ?? BigInt.zero,
      startBlock:   (j['startBlock']  as num?)?.toInt() ?? 0,
      endBlock:     (j['endBlock']    as num?)?.toInt() ?? 0,
      createdAt:    ts > 0
                      ? DateTime.fromMillisecondsSinceEpoch(ts)
                      : DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'proposalId': proposalId, 'title': title, 'description': description,
        'proposer': proposer, 'state': state.name,
        'forVotes': forVotes.toString(), 'againstVotes': againstVotes.toString(),
        'abstainVotes': abstainVotes.toString(),
        'startBlock': startBlock, 'endBlock': endBlock,
        'createdAt': createdAt.millisecondsSinceEpoch,
      };
}
