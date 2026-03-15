class WalletModel {
  final double gstBalance;
  final double stakedGst;
  final int coinsBalance;
  final int diamondsBalance;
  final double pendingRewards;
  final String walletAddress;
  final int chainId; // always 903 (GhostL3)

  const WalletModel({
    this.gstBalance = 0.0,
    this.stakedGst = 0.0,
    this.coinsBalance = 0,
    this.diamondsBalance = 0,
    this.pendingRewards = 0.0,
    this.walletAddress = '',
    this.chainId = 903,
  });

  factory WalletModel.fromJson(Map<String, dynamic> json) {
    return WalletModel(
      gstBalance: (json['gstBalance'] as num?)?.toDouble() ?? 0.0,
      stakedGst: (json['stakedGst'] as num?)?.toDouble() ?? 0.0,
      coinsBalance: (json['coinsBalance'] as num?)?.toInt() ?? 0,
      diamondsBalance: (json['diamondsBalance'] as num?)?.toInt() ?? 0,
      pendingRewards: (json['pendingRewards'] as num?)?.toDouble() ?? 0.0,
      walletAddress: json['walletAddress'] as String? ?? '',
      chainId: (json['chainId'] as num?)?.toInt() ?? 903,
    );
  }

  Map<String, dynamic> toJson() => {
        'gstBalance': gstBalance,
        'stakedGst': stakedGst,
        'coinsBalance': coinsBalance,
        'diamondsBalance': diamondsBalance,
        'pendingRewards': pendingRewards,
        'walletAddress': walletAddress,
        'chainId': chainId,
      };
}
