import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:web3dart/web3dart.dart';
import '../ghost_contracts.dart';
import '../ghost_wallet.dart';

/// GhostBridgeService — cross-layer asset bridging for GhostChain.
///
/// Routing law (enforced): L3 → L2 → L1. Never L3 → L1 directly.
///
/// Bridge contract addresses used:
/// - L3→L2: [GhostContracts.l2L3Bridge] on GhostL3 (chain 903)
/// - L2→L1: [GhostContracts.l1Rollup]   on GhostL2 (chain 901)
///
/// All GhostWallet operations target GhostL3 (chain 903). For L2 operations,
/// the service uses a dedicated Web3Client connected to the L2 RPC.
///
/// Example:
/// ```dart
/// final bridge = GhostBridgeService();
///
/// // Withdraw from L3 → L2 (routing law step 1)
/// final txHash = await bridge.bridgeL3ToL2(
///   wallet: myWallet,
///   amountWei: BigInt.from(1e18.toInt()), // 1 GST
/// );
///
/// // Check status
/// final status = await bridge.getBridgeStatus(txHash, fromLayer: 3);
/// ```
class GhostBridgeService {
  final String _l1Rpc;
  final String _l2Rpc;
  final String _l3Rpc;

  /// L3 chain ID.
  static const int l3ChainId = 903;

  /// L2 chain ID.
  static const int l2ChainId = 901;

  /// L1 chain ID.
  static const int l1ChainId = 14000101;

  /// Minimum bridge amount: 0.001 GST.
  static const BigInt minBridgeWei = BigInt.from(1000000000000000);

  GhostBridgeService({
    String? l1Rpc,
    String? l2Rpc,
    String? l3Rpc,
  })  : _l1Rpc = l1Rpc ?? 'http://localhost:18545',
        _l2Rpc = l2Rpc ?? 'http://localhost:29547',
        _l3Rpc = l3Rpc ?? 'http://localhost:39545';

  // ── L3 → L2 (Routing law: step 1 of withdrawal) ──────────────────────────

  /// Initiate a GST withdrawal from GhostL3 to GhostL2.
  ///
  /// Calls the [GhostContracts.l2L3Bridge] `initiateWithdrawal(uint256)` on L3.
  /// The OP Stack relayer picks up the OutputRoot proof and finalises on L2.
  ///
  /// Throws if [amountWei] < [minBridgeWei] (routing guard).
  Future<String> bridgeL3ToL2({
    required GhostWallet wallet,
    required BigInt amountWei,
  }) async {
    _assertMinAmount(amountWei, 'bridgeL3ToL2');

    final calldata = _encodeInitiateWithdrawal(amountWei);
    final tx = Transaction(
      from: wallet.address,
      to: EthereumAddress.fromHex(GhostContracts.l2L3Bridge),
      value: EtherAmount.inWei(amountWei),
      data: calldata,
      maxGas: 150000,
    );
    return wallet.sendTransaction(tx);
  }

  /// Claim a finalised L3→L2 withdrawal on L2.
  ///
  /// This is called after the challenge period (~7 days on production).
  /// [withdrawalTxHash] is the L3 initiation transaction hash.
  /// [l2PrivateKey] must be the hex private key of the L2 wallet (chain 901).
  Future<String> claimL3ToL2Withdrawal({
    required String withdrawalTxHash,
    required String l2PrivateKey,
    required EthereumAddress recipient,
  }) async {
    final l2Client = Web3Client(_l2Rpc, http.Client());
    try {
      final key = EthPrivateKey.fromHex(
        l2PrivateKey.startsWith('0x') ? l2PrivateKey.substring(2) : l2PrivateKey,
      );
      final proof = await _fetchWithdrawalProof(withdrawalTxHash);
      final calldata = _encodeFinaliseWithdrawal(proof);

      final nonce = await l2Client.getTransactionCount(key.address);
      final tx = Transaction(
        from: key.address,
        to: EthereumAddress.fromHex(GhostContracts.l2Rollup),
        value: EtherAmount.zero(),
        data: calldata,
        nonce: nonce,
        maxGas: 250000,
      );
      final signed = await l2Client.signTransaction(key, tx, chainId: l2ChainId);
      final hash = await l2Client.sendRawTransaction(signed);
      return hash;
    } finally {
      l2Client.dispose();
    }
  }

  // ── L2 → L1 (Routing law: step 2 of withdrawal) ──────────────────────────

  /// Initiate a GST withdrawal from GhostL2 to GhostChain L1.
  ///
  /// Calls the [GhostContracts.l1Rollup] (OptimismPortal) on L2.
  /// [l2PrivateKey] is the hex private key signed for L2 (chain 901).
  Future<String> bridgeL2ToL1({
    required String l2PrivateKey,
    required BigInt amountWei,
    required EthereumAddress recipient,
  }) async {
    _assertMinAmount(amountWei, 'bridgeL2ToL1');

    final l2Client = Web3Client(_l2Rpc, http.Client());
    try {
      final key = EthPrivateKey.fromHex(
        l2PrivateKey.startsWith('0x') ? l2PrivateKey.substring(2) : l2PrivateKey,
      );
      // initiateWithdrawal on the L1Rollup portal (OP Stack MessagePasser)
      final calldata = _encodeInitiateWithdrawal(amountWei);
      final nonce = await l2Client.getTransactionCount(key.address);
      final tx = Transaction(
        from: key.address,
        to: EthereumAddress.fromHex(GhostContracts.l1Rollup),
        value: EtherAmount.inWei(amountWei),
        data: calldata,
        nonce: nonce,
        maxGas: 150000,
      );
      final signed = await l2Client.signTransaction(key, tx, chainId: l2ChainId);
      return await l2Client.sendRawTransaction(signed);
    } finally {
      l2Client.dispose();
    }
  }

  // ── L1 → L2 Deposit (top up L2 from L1) ──────────────────────────────────

  /// Deposit GST from GhostChain L1 into GhostL2.
  ///
  /// Calls the [GhostContracts.l1Rollup] `depositTransaction(...)` on L1.
  /// [l1PrivateKey] is the hex private key signed for L1 (chain 14000101).
  Future<String> depositL1ToL2({
    required String l1PrivateKey,
    required BigInt amountWei,
    required EthereumAddress recipient,
  }) async {
    _assertMinAmount(amountWei, 'depositL1ToL2');

    final l1Client = Web3Client(_l1Rpc, http.Client());
    try {
      final key = EthPrivateKey.fromHex(
        l1PrivateKey.startsWith('0x') ? l1PrivateKey.substring(2) : l1PrivateKey,
      );
      final calldata = _encodeDepositTransaction(recipient, amountWei);
      final nonce = await l1Client.getTransactionCount(key.address);
      final tx = Transaction(
        from: key.address,
        to: EthereumAddress.fromHex(GhostContracts.l1Rollup),
        value: EtherAmount.inWei(amountWei),
        data: calldata,
        nonce: nonce,
        maxGas: 200000,
      );
      final signed = await l1Client.signTransaction(key, tx, chainId: l1ChainId);
      return await l1Client.sendRawTransaction(signed);
    } finally {
      l1Client.dispose();
    }
  }

  // ── Bridge Status ─────────────────────────────────────────────────────────

  /// Query the status of a bridge transaction by its initiation hash.
  ///
  /// [fromLayer] is the originating chain (1, 2, or 3).
  /// Returns a [GhostBridgeStatus] describing the current state.
  Future<GhostBridgeStatus> getBridgeStatus(String txHash, {required int fromLayer}) async {
    final rpc = fromLayer == 3 ? _l3Rpc : fromLayer == 2 ? _l2Rpc : _l1Rpc;
    final receipt = await _getReceipt(rpc, txHash);

    if (receipt == null) {
      return GhostBridgeStatus(
        txHash: txHash,
        state: BridgeState.notFound,
        fromLayer: fromLayer,
      );
    }

    final status = receipt['status'] as String? ?? '0x0';
    final success = status == '0x1';

    return GhostBridgeStatus(
      txHash: txHash,
      state: success ? BridgeState.initiated : BridgeState.failed,
      fromLayer: fromLayer,
      blockNumber: int.tryParse(
            (receipt['blockNumber'] as String? ?? '0x0').replaceFirst('0x', ''),
            radix: 16,
          ) ??
          0,
    );
  }

  /// Get GST balance for [address] on the specified [layer] (1, 2, or 3).
  Future<BigInt> getBalanceOnLayer(String address, {required int layer}) async {
    final rpc = layer == 3 ? _l3Rpc : layer == 2 ? _l2Rpc : _l1Rpc;
    final payload = {
      'jsonrpc': '2.0',
      'id': 1,
      'method': 'ghost_getBalance',
      'params': [address, 'latest'],
    };
    final res = await http.post(
      Uri.parse(rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(payload),
    );
    final decoded = json.decode(res.body) as Map<String, dynamic>;
    final hex = decoded['result'] as String? ?? '0x0';
    return BigInt.tryParse(hex.replaceFirst('0x', ''), radix: 16) ?? BigInt.zero;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void _assertMinAmount(BigInt amount, String label) {
    if (amount < minBridgeWei) {
      throw ArgumentError('$label: amount $amount < minimum bridge amount $minBridgeWei');
    }
  }

  /// initiateWithdrawal(uint256 amount)
  /// Selector: keccak256("initiateWithdrawal(uint256)")[:4] = 0x7d422b7c
  Uint8List _encodeInitiateWithdrawal(BigInt amount) {
    const selector = '7d422b7c';
    final amountHex = amount.toRadixString(16).padLeft(64, '0');
    return _hexToBytes('$selector$amountHex');
  }

  /// finaliseWithdrawal(bytes withdrawalProof)
  /// Selector: 0xa7c18af9
  Uint8List _encodeFinaliseWithdrawal(String proof) {
    const selector = 'a7c18af9';
    final clean = proof.startsWith('0x') ? proof.substring(2) : proof;
    final offset = '0000000000000000000000000000000000000000000000000000000000000020';
    final length = (clean.length ~/ 2).toRadixString(16).padLeft(64, '0');
    final padded = clean.padRight(((clean.length / 64).ceil() * 64), '0');
    return _hexToBytes('$selector$offset$length$padded');
  }

  /// depositTransaction(address to, uint256 value, uint64 gasLimit, bool isCreation, bytes data)
  /// Selector: 0xe9e05c42
  Uint8List _encodeDepositTransaction(EthereumAddress to, BigInt value) {
    const selector = 'e9e05c42';
    final toHex = to.hex.replaceFirst('0x', '').toLowerCase().padLeft(64, '0');
    final valueHex = value.toRadixString(16).padLeft(64, '0');
    const gasLimit = '0000000000000000000000000000000000000000000000000000000000030d40'; // 200000
    const isCreation = '0000000000000000000000000000000000000000000000000000000000000000';
    const dataOffset = '00000000000000000000000000000000000000000000000000000000000000a0';
    const dataLength = '0000000000000000000000000000000000000000000000000000000000000000';
    return _hexToBytes('$selector$toHex$valueHex$gasLimit$isCreation$dataOffset$dataLength');
  }

  Future<String?> _fetchWithdrawalProof(String txHash) async {
    // In production this contacts an OP Stack prover service.
    // Simplified: return the txHash as a stand-in proof identifier.
    return txHash;
  }

  Future<Map<String, dynamic>?> _getReceipt(String rpcUrl, String txHash) async {
    final payload = json.encode({
      'jsonrpc': '2.0',
      'id': 1,
      'method': 'ghost_getTransactionReceipt',
      'params': [txHash],
    });
    final res = await http.post(
      Uri.parse(rpcUrl),
      headers: {'Content-Type': 'application/json'},
      body: payload,
    );
    final decoded = json.decode(res.body) as Map<String, dynamic>;
    return decoded['result'] as Map<String, dynamic>?;
  }

  Uint8List _hexToBytes(String hex) {
    final clean = hex.startsWith('0x') ? hex.substring(2) : hex;
    final result = Uint8List(clean.length ~/ 2);
    for (var i = 0; i < result.length; i++) {
      result[i] = int.parse(clean.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return result;
  }
}

// ── Models ─────────────────────────────────────────────────────────────────────

enum BridgeState {
  /// Transaction not found on-chain yet.
  notFound,

  /// Initiation transaction confirmed; waiting for cross-chain proof.
  initiated,

  /// Challenge period passed; ready to claim on destination chain.
  readyToClaim,

  /// Withdrawal claimed and finalised on the destination chain.
  finalised,

  /// Transaction reverted.
  failed,
}

class GhostBridgeStatus {
  final String txHash;
  final BridgeState state;
  final int fromLayer;
  final int blockNumber;

  const GhostBridgeStatus({
    required this.txHash,
    required this.state,
    required this.fromLayer,
    this.blockNumber = 0,
  });

  int get toLayer => fromLayer == 3 ? 2 : fromLayer == 2 ? 1 : 2;

  bool get isPending => state == BridgeState.initiated || state == BridgeState.notFound;
  bool get isFinalised => state == BridgeState.finalised;

  @override
  String toString() =>
      'GhostBridgeStatus(L$fromLayer→L$toLayer $txHash state=$state block=$blockNumber)';
}
