import 'dart:convert';
import 'package:http/http.dart' as http;

/// Resolves GNS (Ghost Name System) names to GhostChain addresses and metadata.
/// GNS is the on-chain equivalent of ENS for the GhostChain ecosystem.
class IdentityService {
  IdentityService._();
  static final IdentityService instance = IdentityService._();

  static const _l1Rpc = 'http://localhost:18545'; // GhostChain L1

  /// Resolve a GNS name (e.g. "ghost.creator") to a wallet address.
  Future<String?> resolveName(String gnsName) async {
    final res = await http.post(
      Uri.parse(_l1Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_resolveName',
        'params': [gnsName],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) return null;
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as String?;
  }

  /// Reverse-resolve an address to its primary GNS name.
  Future<String?> lookupAddress(String address) async {
    final res = await http.post(
      Uri.parse(_l1Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_lookupAddress',
        'params': [address],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) return null;
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as String?;
  }

  /// Check if a GNS name is available for registration.
  Future<bool> isAvailable(String gnsName) async {
    final res = await http.post(
      Uri.parse(_l1Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_nameAvailable',
        'params': [gnsName],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) return false;
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] == true;
  }

  /// Get a user's full identity record (name, avatar CID, verified status).
  Future<Map<String, dynamic>?> getIdentity(String address) async {
    final res = await http.post(
      Uri.parse(_l1Rpc),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'jsonrpc': '2.0',
        'method': 'ghost_getIdentity',
        'params': [address],
        'id': 1,
      }),
    );
    if (res.statusCode != 200) return null;
    final body = json.decode(res.body) as Map<String, dynamic>;
    return body['result'] as Map<String, dynamic>?;
  }
}
