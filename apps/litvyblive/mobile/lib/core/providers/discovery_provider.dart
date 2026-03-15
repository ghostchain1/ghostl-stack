import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/stream_model.dart';
import '../../services/api_service.dart';

class DiscoveryState {
  const DiscoveryState({
    this.liveRooms = const [],
    this.featuredRooms = const [],
    this.isLoading = false,
    this.searchQuery = '',
  });

  final List<StreamModel> liveRooms;
  final List<StreamModel> featuredRooms;
  final bool isLoading;
  final String searchQuery;

  List<StreamModel> get filteredRooms {
    if (searchQuery.isEmpty) return liveRooms;
    final q = searchQuery.toLowerCase();
    return liveRooms
        .where((r) =>
            r.hostName.toLowerCase().contains(q) ||
            r.title.toLowerCase().contains(q))
        .toList();
  }

  DiscoveryState copyWith({
    List<StreamModel>? liveRooms,
    List<StreamModel>? featuredRooms,
    bool? isLoading,
    String? searchQuery,
  }) =>
      DiscoveryState(
        liveRooms: liveRooms ?? this.liveRooms,
        featuredRooms: featuredRooms ?? this.featuredRooms,
        isLoading: isLoading ?? this.isLoading,
        searchQuery: searchQuery ?? this.searchQuery,
      );
}

class DiscoveryNotifier extends StateNotifier<DiscoveryState> {
  DiscoveryNotifier() : super(const DiscoveryState());

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true);
    try {
      final rooms = await ApiService.instance.getRecommendedStreams();
      state = state.copyWith(
        liveRooms: rooms,
        featuredRooms: rooms.take(5).toList(),
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void search(String query) {
    state = state.copyWith(searchQuery: query);
  }

  void clearSearch() {
    state = state.copyWith(searchQuery: '');
  }
}

final discoveryProvider =
    StateNotifierProvider<DiscoveryNotifier, DiscoveryState>(
  (_) => DiscoveryNotifier(),
);

final filteredRoomsProvider = Provider<List<StreamModel>>(
  (ref) => ref.watch(discoveryProvider).filteredRooms,
);
