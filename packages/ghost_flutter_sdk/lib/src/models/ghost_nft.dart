/// GhostNft — represents a GRC-721 or GRC-1155 NFT on GhostChain.
///
/// GhostChain uses GRC-721/GRC-1155 standards (never ERC-721/1155).
/// All NFTs exist on GhostL3 (chain ID 903) by default, unless specifically
/// minted on L2 for high-value collectibles.
///
/// ```dart
/// final nft = GhostNft(
///   tokenId: BigInt.from(42),
///   contractAddress: '0xAbCd...',
///   ownerAddress: '0x1234...',
///   metadataUri: 'ghost://nfts/42/metadata.json',
///   name: 'GhostPunk #42',
///   standard: NftStandard.grc721,
/// );
///
/// print(nft.displayName);    // GhostPunk #42
/// print(nft.chainId);        // 903
/// ```
class GhostNft {
  final BigInt tokenId;
  final String contractAddress;
  final String ownerAddress;
  final String metadataUri;
  final String name;
  final String? description;
  final String? imageUri;
  final String? collection;
  final NftStandard standard;
  final int chainId;
  final int mintedAt; // Unix ms

  /// Optional: gift ID if this NFT was minted via the gift engine.
  final String? giftId;

  /// Creator/royalty recipient address.
  final String? creatorAddress;

  /// Royalty percentage in bps (e.g. 500 = 5 %).
  final int royaltyBps;

  const GhostNft({
    required this.tokenId,
    required this.contractAddress,
    required this.ownerAddress,
    required this.metadataUri,
    required this.name,
    this.description,
    this.imageUri,
    this.collection,
    this.standard = NftStandard.grc721,
    this.chainId = 903,
    this.mintedAt = 0,
    this.giftId,
    this.creatorAddress,
    this.royaltyBps = 0,
  });

  String get displayName => collection != null ? '$collection #$tokenId' : name;

  bool get isGiftNft => giftId != null;

  factory GhostNft.fromJson(Map<String, dynamic> j) {
    final stdStr = j['standard'] as String? ?? 'grc721';
    final std = NftStandard.values.firstWhere(
      (s) => s.name == stdStr,
      orElse: () => NftStandard.grc721,
    );
    return GhostNft(
      tokenId:         BigInt.tryParse(j['tokenId']?.toString() ?? '0') ?? BigInt.zero,
      contractAddress: j['contractAddress'] as String? ?? '',
      ownerAddress:    j['ownerAddress']    as String? ?? '',
      metadataUri:     j['metadataUri']     as String? ?? '',
      name:            j['name']            as String? ?? '',
      description:     j['description']     as String?,
      imageUri:        j['imageUri']        as String?,
      collection:      j['collection']      as String?,
      standard:        std,
      chainId:         (j['chainId']        as num?)?.toInt() ?? 903,
      mintedAt:        (j['mintedAt']       as num?)?.toInt() ?? 0,
      giftId:          j['giftId']          as String?,
      creatorAddress:  j['creatorAddress']  as String?,
      royaltyBps:      (j['royaltyBps']     as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'tokenId':         tokenId.toString(),
        'contractAddress': contractAddress,
        'ownerAddress':    ownerAddress,
        'metadataUri':     metadataUri,
        'name':            name,
        if (description != null) 'description': description,
        if (imageUri    != null) 'imageUri':    imageUri,
        if (collection  != null) 'collection':  collection,
        'standard':        standard.name,
        'chainId':         chainId,
        'mintedAt':        mintedAt,
        if (giftId         != null) 'giftId':        giftId,
        if (creatorAddress != null) 'creatorAddress': creatorAddress,
        'royaltyBps':      royaltyBps,
      };

  @override
  String toString() => 'GhostNft($displayName@$contractAddress chain=$chainId)';

  @override
  bool operator ==(Object other) =>
      other is GhostNft &&
      tokenId == other.tokenId &&
      contractAddress.toLowerCase() == other.contractAddress.toLowerCase() &&
      chainId == other.chainId;

  @override
  int get hashCode => Object.hash(tokenId, contractAddress.toLowerCase(), chainId);
}

/// The GRC token standard used by the NFT.
enum NftStandard {
  /// Single-token fungible standard (replaces ERC-721 on GhostChain).
  grc721,

  /// Multi-token semi-fungible standard (replaces ERC-1155 on GhostChain).
  grc1155,
}
