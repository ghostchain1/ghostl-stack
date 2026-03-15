import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/stream_model.dart';
import '../../services/stream_service.dart';
import '../../services/api_service.dart';

enum StreamStatus { idle, connecting, live, error }

class StreamState {
  const StreamState({
    this.status = StreamStatus.idle,
    this.currentStream,
    this.viewerCount = 0,
    this.errorMessage,
    this.liveRooms = const [],
  });

  final StreamStatus status;
  final StreamModel? currentStream;
  final int viewerCount;
  final String? errorMessage;
  final List<StreamModel> liveRooms;

  bool get isLive => status == StreamStatus.live;

  StreamState copyWith({
    StreamStatus? status,
    StreamModel? currentStream,
    int? viewerCount,
    String? errorMessage,
    List<StreamModel>? liveRooms,
  }) =>
      StreamState(
        status: status ?? this.status,
        currentStream: currentStream ?? this.currentStream,
        viewerCount: viewerCount ?? this.viewerCount,
        errorMessage: errorMessage ?? this.errorMessage,
        liveRooms: liveRooms ?? this.liveRooms,
      );
}

class StreamNotifier extends StateNotifier<StreamState> {
  StreamNotifier() : super(const StreamState());

  Future<void> fetchLiveRooms() async {
    try {
      final rooms = await StreamService.instance.getLiveStreams();
      state = state.copyWith(liveRooms: rooms);
    } catch (_) {}
  }

  Future<void> joinStream(String streamId) async {
    state = state.copyWith(status: StreamStatus.connecting);
    try {
      final stream = await ApiService.instance.getStream(streamId);
      state = state.copyWith(
        status: StreamStatus.live,
        currentStream: stream,
        viewerCount: stream.viewerCount,
      );
    } catch (e) {
      state = state.copyWith(
        status: StreamStatus.error,
        errorMessage: e.toString(),
      );
    }
  }

  void updateViewerCount(int count) {
    state = state.copyWith(viewerCount: count);
  }

  void leaveStream() {
    state = const StreamState();
  }
}

final streamProvider = StateNotifierProvider<StreamNotifier, StreamState>(
  (_) => StreamNotifier(),
);

final liveRoomsProvider = Provider<List<StreamModel>>(
  (ref) => ref.watch(streamProvider).liveRooms,
);

final activeStreamProvider = Provider<StreamModel?>(
  (ref) => ref.watch(streamProvider).currentStream,
);

final viewerCountProvider = Provider<int>(
  (ref) => ref.watch(streamProvider).viewerCount,
);
