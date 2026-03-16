/// GhostCreator — profile of a content creator on GhostChain.
///
/// Creators can have:
/// - A GNS name (Ghost Name System, e.g. `ghostcreator.ghost`) resolved on L1.
/// - A fan token (creator token) on GhostL3 for community monetisation.
/// - L3-native streaming/tipping via LitVybzLive.
/// - GhostUniverse avatars / virtual worlds.
///
/// ```dart
/// final creator = GhostCreator(
///   address: '0xABCD...',
///   gnsName: 'ghostcreator.ghost',
///   displayName: 'Ghost Creator',
///   isVerified: true,
/// );
///
/// print(creator.shortName); // ghostcreator.ghost
/// ```
class GhostCreator {
  /// L3 wallet address (native GhostChain address).
  final String address;

  /// GNS domain (e.g. `username.ghost`). Null if not registered.
  final String? gnsName;

  final String displayName;

  /// IPFS/GHOST CID for the creator's profile image.
  final String? avatarCid;

  final String? bio;

  final bool isVerified;

  /// Creator fan-token contract address on GhostL3. Null if not launched.
  final String? fanTokenAddress;

  /// Creator fan-token ticker symbol (e.g. `GCREATOR`). Null if not launched.
  final String? fanTokenSymbol;

  /// Total GST earnings (in wei) accumulated on L3.
  final BigInt totalEarningsGSTWei;

  /// Number of followers tracked off-chain.
  final int followerCount;

  /// Social links (optional).
  final Map<String, String> socialLinks;

  const GhostCreator({
    required this.address,
    this.gnsName,
    required this.displayName,
    this.avatarCid,
    this.bio,
    this.isVerified = false,
    this.fanTokenAddress,
    this.fanTokenSymbol,
    this.totalEarningsGSTWei = BigInt.zero,
    this.followerCount = 0,
    this.socialLinks = const {},
  });

  /// The most user-friendly identifier: GNS name or shortened address.
  String get shortName => gnsName ?? _shortenAddress(address);

  bool get hasFanToken => fanTokenAddress != null;

  String? get avatarUrl =>
      avatarCid != null ? 'ghost://ipfs/$avatarCid' : null;

  factory GhostCreator.fromJson(Map<String, dynamic> j) {
    final social = (j['socialLinks'] as Map<String, dynamic>?)
            ?.map((k, v) => MapEntry(k, v as String)) ??
        {};
    return GhostCreator(
      address:              j['address']          as String? ?? '',
      gnsName:              j['gnsName']          as String?,
      displayName:          j['displayName']      as String? ?? '',
      avatarCid:            j['avatarCid']        as String?,
      bio:                  j['bio']              as String?,
      isVerified:           j['isVerified']       as bool?   ?? false,
      fanTokenAddress:      j['fanTokenAddress']  as String?,
      fanTokenSymbol:       j['fanTokenSymbol']   as String?,
      totalEarningsGSTWei:  BigInt.tryParse(j['totalEarningsGSTWei']?.toString() ?? '0') ?? BigInt.zero,
      followerCount:        (j['followerCount']   as num?)?.toInt() ?? 0,
      socialLinks:          social,
    );
  }

  Map<String, dynamic> toJson() => {
        'address':             address,
        if (gnsName        != null) 'gnsName':        gnsName,
        'displayName':         displayName,
        if (avatarCid      != null) 'avatarCid':      avatarCid,
        if (bio            != null) 'bio':            bio,
        'isVerified':          isVerified,
        if (fanTokenAddress != null) 'fanTokenAddress': fanTokenAddress,
        if (fanTokenSymbol  != null) 'fanTokenSymbol':  fanTokenSymbol,
        'totalEarningsGSTWei': totalEarningsGSTWei.toString(),
        'followerCount':       followerCount,
        'socialLinks':         socialLinks,
      };

  @override
  String toString() =>
      'GhostCreator(${shortName} verified=$isVerified fans=$followerCount)';

  @override
  bool operator ==(Object other) =>
      other is GhostCreator && address.toLowerCase() == other.address.toLowerCase();

  @override
  int get hashCode => address.toLowerCase().hashCode;

  String _shortenAddress(String addr) {
    if (addr.length < 10) return addr;
    return '${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}';
  }
}
