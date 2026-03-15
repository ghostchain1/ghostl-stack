import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/gift_model.dart';
import '../../services/gift_service.dart';

class GiftQueueItem {
  const GiftQueueItem({
    required this.gift,
    required this.senderName,
    this.quantity = 1,
  });
  final GiftModel gift;
  final String senderName;
  final int quantity;
}

class GiftState {
  const GiftState({
    this.availableGifts = const [],
    this.queue = const [],
    this.totalReceived = 0,
  });

  final List<GiftModel> availableGifts;
  final List<GiftQueueItem> queue;
  final int totalReceived;

  GiftState copyWith({
    List<GiftModel>? availableGifts,
    List<GiftQueueItem>? queue,
    int? totalReceived,
  }) =>
      GiftState(
        availableGifts: availableGifts ?? this.availableGifts,
        queue: queue ?? this.queue,
        totalReceived: totalReceived ?? this.totalReceived,
      );
}

class GiftNotifier extends StateNotifier<GiftState> {
  GiftNotifier() : super(const GiftState());

  Future<void> loadGifts() async {
    // GiftService does not expose a catalog endpoint; gifts are defined
    // in the app constants / fetched from the backend catalog route.
    // No-op for now — gifts are loaded from GiftModel constants.
  }

  Future<bool> sendGift({
    required String giftId,
    required String streamId,
    int quantity = 1,
  }) async {
    final gift = state.availableGifts.firstWhere(
      (g) => g.id == giftId,
      orElse: () => GiftModel(id: giftId, name: '', price: 0, icon: ''),
    );
    try {
      await GiftService.instance.sendQuickGift(streamId, gift);
      return true;
    } catch (_) {
      return false;
    }
  }

  void enqueueIncoming(GiftQueueItem item) {
    final updated = [...state.queue, item];
    state = state.copyWith(
      queue: updated,
      totalReceived: state.totalReceived + item.quantity,
    );
  }

  void dequeueFirst() {
    if (state.queue.isEmpty) return;
    state = state.copyWith(queue: state.queue.sublist(1));
  }

  void clearQueue() {
    state = state.copyWith(queue: []);
  }
}

final giftProvider = StateNotifierProvider<GiftNotifier, GiftState>(
  (_) => GiftNotifier(),
);

final availableGiftsProvider = Provider<List<GiftModel>>(
  (ref) => ref.watch(giftProvider).availableGifts,
);

final giftQueueProvider = Provider<List<GiftQueueItem>>(
  (ref) => ref.watch(giftProvider).queue,
);
