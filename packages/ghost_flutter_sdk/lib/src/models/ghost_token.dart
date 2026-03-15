/// GhostToken — GST token metadata on GhostL3 (chain 903).
class GhostToken {
  static const String symbol = 'GST';
  static const String name = 'Ghost Token';
  static const int decimals = 18;
  static const int chainId = 903; // GhostL3 only
  static const BigInt unit = BigInt.from(1000000000000000000); // 1e18

  /// Convert a human-readable GST amount to wei.
  static BigInt toWei(double amount) =>
      BigInt.from((amount * 1e18).truncate());

  /// Convert wei to a display string (e.g. "1.5000 GST").
  static String formatWei(BigInt wei, {int decimals = 4}) {
    final gst = wei.toDouble() / 1e18;
    return '${gst.toStringAsFixed(decimals)} $symbol';
  }
}
