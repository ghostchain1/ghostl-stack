/// GhostBalance — on-chain GST balance and staked amounts for a GhostL3 account.
class GhostBalance {
  final BigInt wei;          // raw on-chain balance
  final BigInt stakedWei;    // staked in CreatorTreasury
  final int chainId;         // always 903

  const GhostBalance({
    required this.wei,
    this.stakedWei = BigInt.zero,
    this.chainId = 903,
  });

  double get gst => wei / BigInt.from(10).pow(18);
  double get stakedGst => stakedWei / BigInt.from(10).pow(18);

  factory GhostBalance.fromJson(Map<String, dynamic> json) {
    return GhostBalance(
      wei: BigInt.parse(json['wei'] as String? ?? '0'),
      stakedWei: BigInt.parse(json['stakedWei'] as String? ?? '0'),
      chainId: (json['chainId'] as num?)?.toInt() ?? 903,
    );
  }

  Map<String, dynamic> toJson() => {
        'wei': wei.toString(),
        'stakedWei': stakedWei.toString(),
        'chainId': chainId,
      };

  @override
  String toString() => '${gst.toStringAsFixed(4)} GST (chain $chainId)';
}
