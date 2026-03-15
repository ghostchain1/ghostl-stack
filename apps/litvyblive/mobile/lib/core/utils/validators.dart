class Validators {
  static String? username(String? value) {
    if (value == null || value.isEmpty) return 'Username is required';
    if (value.length < 3) return 'At least 3 characters';
    if (value.length > 30) return 'Max 30 characters';
    if (!RegExp(r'^[a-zA-Z0-9_\.]+$').hasMatch(value)) {
      return 'Only letters, numbers, underscores, and dots';
    }
    return null;
  }

  static String? email(String? value) {
    if (value == null || value.isEmpty) return 'Email is required';
    if (!RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(value)) {
      return 'Invalid email address';
    }
    return null;
  }

  static String? password(String? value) {
    if (value == null || value.isEmpty) return 'Password is required';
    if (value.length < 8) return 'At least 8 characters';
    return null;
  }

  static String? walletAddress(String? value) {
    if (value == null || value.isEmpty) return 'Address is required';
    if (!RegExp(r'^0x[0-9a-fA-F]{40}$').hasMatch(value)) {
      return 'Invalid GhostChain address';
    }
    return null;
  }

  static String? gstAmount(String? value, {double? maxBalance}) {
    if (value == null || value.isEmpty) return 'Amount is required';
    final parsed = double.tryParse(value);
    if (parsed == null || parsed <= 0) return 'Enter a valid amount';
    if (maxBalance != null && parsed > maxBalance) {
      return 'Exceeds balance';
    }
    return null;
  }

  static bool isValidStreamId(String id) =>
      id.isNotEmpty && RegExp(r'^[a-zA-Z0-9\-_]+$').hasMatch(id);
}
