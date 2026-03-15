/// GhostTx — a GhostL3 transaction record.
class GhostTx {
  final String hash;
  final String from;
  final String to;
  final BigInt valueWei;
  final int chainId; // always 903
  final DateTime timestamp;
  final bool isPending;

  const GhostTx({
    required this.hash,
    required this.from,
    required this.to,
    required this.valueWei,
    this.chainId = 903,
    required this.timestamp,
    this.isPending = false,
  });

  double get gstAmount => valueWei / BigInt.from(10).pow(18);

  factory GhostTx.fromJson(Map<String, dynamic> json) {
    return GhostTx(
      hash: json['hash'] as String? ?? '',
      from: json['from'] as String? ?? '',
      to: json['to'] as String? ?? '',
      valueWei: BigInt.parse(json['valueWei'] as String? ?? '0'),
      chainId: (json['chainId'] as num?)?.toInt() ?? 903,
      timestamp: json['timestamp'] != null
          ? DateTime.parse(json['timestamp'] as String)
          : DateTime.now(),
      isPending: json['isPending'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'hash': hash,
        'from': from,
        'to': to,
        'valueWei': valueWei.toString(),
        'chainId': chainId,
        'timestamp': timestamp.toIso8601String(),
        'isPending': isPending,
      };
}
