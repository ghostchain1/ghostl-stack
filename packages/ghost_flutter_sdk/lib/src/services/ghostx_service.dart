import 'dart:typed_data';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:web3dart/web3dart.dart';
import '../ghost_wallet.dart';

/// GhostXService — Flutter client for GhostXchange (Ghost DEX).
///
/// GhostXchange is the canonical DEX on GhostL3 (chain ID 903).
/// All swaps and liquidity operations are executed via `ghost_*` JSON-RPC
/// calls — never via `eth_*` calls or any external chain.
///
/// Routing law: L3 only. No external chains. No non-GST external tokens.
///
/// ```dart
/// final ghostX = GhostXService();
///
/// // Get price of a creator token in GST
/// final priceWei = await ghostX.getGstPrice(tokenAddress);
///
/// // Swap 1 GST → creator token
/// final txHash = await ghostX.swap(
///   fromToken: GhostXService.wGST,
///   toToken: creatorTokenAddress,
///   amountWei: BigInt.from(1e18.toInt()),
///   wallet: myWallet,
/// );
/// ```
class GhostXService {
  final String _l3Rpc;
  int _nonce = 1;

  /// Canonical wrapped-GST address on GhostL3 (treated as the base currency).
  static const String wGST = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

  /// GhostXchange router on GhostL3.
  static const String ghostXRouter = '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf';

  /// GhostL3 chain ID.
  static const int l3ChainId = 903;

  GhostXService({String? l3Rpc})
      : _l3Rpc = l3Rpc ?? 'http://localhost:39545';

  // ── Price Queries ─────────────────────────────────────────────────────────

  /// Get the spot price of [tokenAddress] denominated in GST wei.
  ///
  /// Calls `ghost_call` on the GhostXchange pair contract to read reserves
  /// and returns the output amount for 1 GST input.
  Future<BigInt> getGstPrice(String tokenAddress) async {
    // ghost_call to GhostXchange router: getAmountsOut(1e18, [wGST, token])
    final inputWei = BigInt.from(10).pow(18); // 1 GST
    final amounts = await getAmountsOut(inputWei, [wGST, tokenAddress]);
    if (amounts.length < 2) return BigInt.zero;
    return amounts[1];
  }

  /// Get output amounts for a swap path using `ghost_call`.
  ///
  /// Returns a list of amounts through each hop in [path].
  Future<List<BigInt>> getAmountsOut(BigInt amountIn, List<String> path) async {
    // ABI-encode getAmountsOut(uint256,address[])
    // selector: keccak256("getAmountsOut(uint256,address[])") → first 4 bytes
    // For now we use a simplified calldata representation via ghost_call JSON-RPC.
    final payload = _rpcPayload('ghost_call', [
      {
        'to': ghostXRouter,
        'data': _encodeGetAmountsOut(amountIn, path),
      },
      'latest',
    ]);
    final res = await _post(payload);
    final resultHex = res['result'] as String? ?? '0x';
    if (resultHex == '0x' || resultHex.isEmpty) return [];
    return _decodeUint256Array(resultHex);
  }

  // ── Swap ──────────────────────────────────────────────────────────────────

  /// Swap [amountWei] of [fromToken] for [toToken] via GhostXchange.
  ///
  /// [slippageBps] defaults to 50 (0.5 %). Deadline is 20 minutes from now.
  /// Returns the L3 transaction hash.
  Future<String> swap({
    required String fromToken,
    required String toToken,
    required BigInt amountWei,
    required GhostWallet wallet,
    int slippageBps = 50,
  }) async {
    final path = [fromToken, toToken];
    final amounts = await getAmountsOut(amountWei, path);
    final minOut = amounts.isEmpty
        ? BigInt.zero
        : amounts.last * BigInt.from(10000 - slippageBps) ~/ BigInt.from(10000);
    final deadline = DateTime.now().millisecondsSinceEpoch ~/ 1000 + 1200;

    final calldata = _encodeSwapExactTokens(
      amountIn: amountWei,
      amountOutMin: minOut,
      path: path,
      to: wallet.address.hex,
      deadline: BigInt.from(deadline),
    );

    return _sendTx(wallet: wallet, to: ghostXRouter, data: calldata, value: BigInt.zero);
  }

  /// Swap GST (native) for [toToken]. Value is [amountGSTWei].
  Future<String> swapGstForToken({
    required String toToken,
    required BigInt amountGSTWei,
    required GhostWallet wallet,
    int slippageBps = 50,
  }) async {
    final path = [wGST, toToken];
    final amounts = await getAmountsOut(amountGSTWei, path);
    final minOut = amounts.isEmpty
        ? BigInt.zero
        : amounts.last * BigInt.from(10000 - slippageBps) ~/ BigInt.from(10000);
    final deadline = DateTime.now().millisecondsSinceEpoch ~/ 1000 + 1200;

    final calldata = _encodeSwapExactGstForTokens(
      amountOutMin: minOut,
      path: path,
      to: wallet.address.hex,
      deadline: BigInt.from(deadline),
    );

    return _sendTx(wallet: wallet, to: ghostXRouter, data: calldata, value: amountGSTWei);
  }

  // ── Liquidity ─────────────────────────────────────────────────────────────

  /// Fetch pool reserves for a [tokenAddress]/GST pair.
  ///
  /// Returns `{'gstReserve': BigInt, 'tokenReserve': BigInt, 'pair': String}`.
  Future<GhostXPoolInfo> getPoolInfo(String tokenAddress) async {
    final payload = _rpcPayload('ghost_call', [
      {
        'to': ghostXRouter,
        'data': _encodeGetPairInfo(tokenAddress),
      },
      'latest',
    ]);
    final res = await _post(payload);
    final hex = res['result'] as String? ?? '0x';
    return _decodePairInfo(hex, tokenAddress);
  }

  // ── Fee Info ──────────────────────────────────────────────────────────────

  /// Standard GhostXchange protocol fee in bps (30 = 0.3 %).
  static const int protocolFeeBps = 30;

  /// Calculate the fee amount for a given [amountIn].
  static BigInt calcFee(BigInt amountIn) =>
      amountIn * BigInt.from(protocolFeeBps) ~/ BigInt.from(10000);

  // ── Internal helpers ──────────────────────────────────────────────────────

  Future<String> _sendTx({
    required GhostWallet wallet,
    required String to,
    required String data,
    required BigInt value,
  }) async {
    final countPayload = _rpcPayload('ghost_getTransactionCount', [wallet.address.hex, 'pending']);
    final countRes = await _post(countPayload);
    final countHex = countRes['result'] as String? ?? '0x0';
    final nonce = int.tryParse(countHex.replaceFirst('0x', ''), radix: 16) ?? _nonce++;

    final tx = Transaction(
      from: wallet.address,
      to: EthereumAddress.fromHex(to),
      value: EtherAmount.inWei(value),
      data: Uint8List.fromList(_hexToBytes(data)),
      nonce: nonce,
      gasPrice: EtherAmount.inWei(BigInt.from(1000000000)), // 1 gwei
      maxGas: 300000,
    );

    return wallet.sendTransaction(tx);
  }

  Future<Map<String, dynamic>> _post(Map<String, dynamic> payload) async {
    final res = await http.post(
      Uri.parse(_l3Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(payload),
    );
    if (res.statusCode != 200) {
      throw Exception('GhostXService RPC error [${res.statusCode}]: ${res.body}');
    }
    final decoded = json.decode(res.body) as Map<String, dynamic>;
    if (decoded.containsKey('error')) {
      throw Exception('GhostXService RPC error: ${decoded['error']}');
    }
    return decoded;
  }

  Map<String, dynamic> _rpcPayload(String method, List<dynamic> params) => {
        'jsonrpc': '2.0',
        'id': _nonce++,
        'method': method,
        'params': params,
      };

  // ── ABI minimal encoding ──────────────────────────────────────────────────
  // All encoding uses simple hex construction — not a full ABI codec.
  // A production build should use a proper ABI encoder library.

  /// getAmountsOut(uint256 amountIn, address[] path)
  String _encodeGetAmountsOut(BigInt amountIn, List<String> path) {
    const selector = 'd06ca61f'; // keccak256("getAmountsOut(uint256,address[])")[:4]
    final amount = _padLeft(amountIn.toRadixString(16), 64);
    final offset = _padLeft('40', 64); // offset to path array
    final length = _padLeft(path.length.toRadixString(16), 64);
    final addrs = path.map((a) => _padLeft(a.replaceFirst('0x', ''), 64)).join();
    return '0x$selector$amount$offset$length$addrs';
  }

  /// swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
  String _encodeSwapExactTokens({
    required BigInt amountIn,
    required BigInt amountOutMin,
    required List<String> path,
    required String to,
    required BigInt deadline,
  }) {
    const selector = '38ed1739';
    final a = _padLeft(amountIn.toRadixString(16), 64);
    final b = _padLeft(amountOutMin.toRadixString(16), 64);
    final pathOffset = _padLeft('a0', 64); // 5 * 32 = 160 = 0xa0
    final toHex = _padLeft(to.replaceFirst('0x', ''), 64);
    final dl = _padLeft(deadline.toRadixString(16), 64);
    final length = _padLeft(path.length.toRadixString(16), 64);
    final addrs = path.map((a) => _padLeft(a.replaceFirst('0x', ''), 64)).join();
    return '0x$selector$a$b$pathOffset$toHex$dl$length$addrs';
  }

  /// swapExactETHForTokens(uint256,address[],address,uint256)  — called with GST value
  String _encodeSwapExactGstForTokens({
    required BigInt amountOutMin,
    required List<String> path,
    required String to,
    required BigInt deadline,
  }) {
    const selector = '7ff36ab3'; // swapExactETHForTokens
    final b = _padLeft(amountOutMin.toRadixString(16), 64);
    final pathOffset = _padLeft('80', 64); // 4 * 32 = 128 = 0x80
    final toHex = _padLeft(to.replaceFirst('0x', ''), 64);
    final dl = _padLeft(deadline.toRadixString(16), 64);
    final length = _padLeft(path.length.toRadixString(16), 64);
    final addrs = path.map((a) => _padLeft(a.replaceFirst('0x', ''), 64)).join();
    return '0x$selector$b$pathOffset$toHex$dl$length$addrs';
  }

  /// getPairInfo(address token) - custom GhostXchange router view
  String _encodeGetPairInfo(String tokenAddress) {
    const selector = 'aabcdef0'; // placeholder — actual selector depends on deployed contract
    final addr = _padLeft(tokenAddress.replaceFirst('0x', ''), 64);
    return '0x$selector$addr';
  }

  // ── ABI minimal decoding ──────────────────────────────────────────────────

  List<BigInt> _decodeUint256Array(String hex) {
    final clean = hex.replaceFirst('0x', '');
    if (clean.length < 128) return [];
    // Skip offset (32 bytes) → length (32 bytes) → elements
    final lengthHex = clean.substring(64, 128);
    final count = int.tryParse(lengthHex, radix: 16) ?? 0;
    final result = <BigInt>[];
    for (var i = 0; i < count; i++) {
      final start = 128 + i * 64;
      final end = start + 64;
      if (end > clean.length) break;
      result.add(BigInt.tryParse(clean.substring(start, end), radix: 16) ?? BigInt.zero);
    }
    return result;
  }

  GhostXPoolInfo _decodePairInfo(String hex, String tokenAddress) {
    final clean = hex.replaceFirst('0x', '');
    if (clean.length < 192) {
      return GhostXPoolInfo(
        pairAddress: '0x0000000000000000000000000000000000000000',
        gstReserve: BigInt.zero,
        tokenReserve: BigInt.zero,
        tokenAddress: tokenAddress,
      );
    }
    // Expecting: address pair (32), uint256 reserve0 (32), uint256 reserve1 (32)
    final pair = '0x${clean.substring(24, 64)}';
    final r0 = BigInt.tryParse(clean.substring(64, 128), radix: 16) ?? BigInt.zero;
    final r1 = BigInt.tryParse(clean.substring(128, 192), radix: 16) ?? BigInt.zero;
    return GhostXPoolInfo(
      pairAddress: pair,
      gstReserve: r0,
      tokenReserve: r1,
      tokenAddress: tokenAddress,
    );
  }

  // ── Byte utilities ────────────────────────────────────────────────────────

  String _padLeft(String s, int width) =>
      s.padLeft(width, '0').substring(s.length > width ? s.length - width : 0);

  List<int> _hexToBytes(String hex) {
    final clean = hex.startsWith('0x') ? hex.substring(2) : hex;
    final result = <int>[];
    for (var i = 0; i < clean.length; i += 2) {
      result.add(int.parse(clean.substring(i, i + 2), radix: 16));
    }
    return result;
  }
}

// ── Model ─────────────────────────────────────────────────────────────────────

class GhostXPoolInfo {
  final String pairAddress;
  final BigInt gstReserve;
  final BigInt tokenReserve;
  final String tokenAddress;

  const GhostXPoolInfo({
    required this.pairAddress,
    required this.gstReserve,
    required this.tokenReserve,
    required this.tokenAddress,
  });

  /// Current spot price: GST per 1 token (in GST wei).
  BigInt get gstPerToken => tokenReserve == BigInt.zero
      ? BigInt.zero
      : gstReserve * BigInt.from(10).pow(18) ~/ tokenReserve;

  bool get hasLiquidity => gstReserve > BigInt.zero && tokenReserve > BigInt.zero;
}
