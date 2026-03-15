import 'package:intl/intl.dart';

class GstFormatter {
  static final _compact = NumberFormat.compact();
  static final _full = NumberFormat('#,##0.##');

  /// "1.2M GST", "450K GST", "1,234.5 GST"
  static String compact(double amount) => '${_compact.format(amount)} GST';

  /// "1,234.56 GST"
  static String full(double amount) => '${_full.format(amount)} GST';

  /// Raw with decimals for on-chain display
  static String raw(double amount) => amount.toStringAsFixed(6);
}

class DateFormatter {
  static String timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return DateFormat('MMM d').format(dt);
  }

  static String duration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$s' : '$m:$s';
  }

  static String fullDate(DateTime dt) =>
      DateFormat('MMM d, yyyy · h:mm a').format(dt);
}

class ViewerFormatter {
  static String format(int count) {
    if (count >= 1000000) return '${(count / 1000000).toStringAsFixed(1)}M';
    if (count >= 1000) return '${(count / 1000).toStringAsFixed(1)}K';
    return count.toString();
  }
}

class WalletFormatter {
  /// Truncate 0x address: "0x1234…abcd"
  static String truncate(String address, {int chars = 4}) {
    if (address.length <= chars * 2 + 2) return address;
    return '${address.substring(0, chars + 2)}…${address.substring(address.length - chars)}';
  }
}
