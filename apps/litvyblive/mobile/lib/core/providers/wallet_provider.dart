import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/wallet_model.dart';
import '../../services/wallet_service.dart';

class WalletState {
  const WalletState({
    this.wallet,
    this.isLoading = false,
    this.errorMessage,
  });

  final WalletModel? wallet;
  final bool isLoading;
  final String? errorMessage;

  double get gstBalance => wallet?.gstBalance ?? 0.0;
  String get walletAddress => wallet?.walletAddress ?? '';

  WalletState copyWith({
    WalletModel? wallet,
    bool? isLoading,
    String? errorMessage,
  }) =>
      WalletState(
        wallet: wallet ?? this.wallet,
        isLoading: isLoading ?? this.isLoading,
        errorMessage: errorMessage,
      );
}

class WalletNotifier extends StateNotifier<WalletState> {
  WalletNotifier() : super(const WalletState());

  Future<void> loadWallet() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final wallet = await WalletService.instance.getBalance();
      state = state.copyWith(wallet: wallet, isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }

  Future<bool> sendGst({
    required String toAddress,
    required double amount,
  }) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      await WalletService.instance.withdrawGst(
        amount: amount,
        toAddress: toAddress,
      );
      await loadWallet();
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  void refreshBalance(double newBalance) {
    // Re-fetch from service to get authoritative on-chain balance
    loadWallet();
  }

  WalletState get wallet => state;
}

final walletProvider = StateNotifierProvider<WalletNotifier, WalletState>(
  (_) => WalletNotifier(),
);

final gstBalanceProvider = Provider<double>(
  (ref) => ref.watch(walletProvider).gstBalance,
);

final walletAddressProvider = Provider<String>(
  (ref) => ref.watch(walletProvider).walletAddress,
);
