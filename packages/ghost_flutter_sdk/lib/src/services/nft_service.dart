import 'dart:convert';
import 'package:http/http.dart' as http;
import '../ghost_wallet.dart';

/// GhostNftService — NFT gift minting and queries on GhostL3 (chain 903).
class GhostNftService {
  final String _apiBase;
  final GhostWallet _wallet;
  final String? _bearerToken;

  GhostNftService({
    required String apiBase,
    required GhostWallet wallet,
    String? bearerToken,
  })  : _apiBase = apiBase,
        _wallet = wallet,
        _bearerToken = bearerToken;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_bearerToken != null) 'Authorization': 'Bearer $_bearerToken',
      };

  /// Mint an NFT gift (e.g. Dragon) to a recipient on GhostL3.
  Future<String> mintNftGift({
    required String recipientAddress,
    required String giftId,
    required String metadataUri,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/nft/mint'),
      headers: _headers,
      body: json.encode({
        'recipient': recipientAddress,
        'giftId': giftId,
        'metadataUri': metadataUri,
        'senderAddress': _wallet.address.hex,
        'chainId': 903,
      }),
    );
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception('NFT mint failed: ${res.body}');
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['txHash'] as String? ?? '';
  }

  Future<List<Map<String, dynamic>>> getNftsForAddress(String address) async {
    final res = await http.get(
      Uri.parse('$_apiBase/nft/owned/$address?chainId=903'),
      headers: _headers,
    );
    if (res.statusCode != 200) {
      throw Exception('Failed to load NFTs');
    }
    final data = json.decode(res.body) as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().toList();
  }
}
