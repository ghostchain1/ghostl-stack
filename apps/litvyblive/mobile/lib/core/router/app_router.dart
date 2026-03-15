import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../screens/splash/splash_screen.dart';
import '../../screens/auth/login_screen.dart';
import '../../screens/auth/signup_screen.dart';
import '../../screens/home/home_screen.dart';
import '../../screens/live/live_room_screen.dart';
import '../../screens/live/live_host_screen.dart';
import '../../screens/live/pk_battle_screen.dart';
import '../../screens/live/avatar_live_screen.dart';
import '../../screens/profile/profile_screen.dart';
import '../../screens/wallet/wallet_screen.dart';
import '../../screens/wallet/withdraw_screen.dart';
import '../../screens/ranking/global_ranking_screen.dart';
import '../../screens/events/event_hub_screen.dart';
import '../../screens/games/game_hub_screen.dart';
import '../../screens/agency/agency_dashboard.dart';
import '../../screens/agency/agency_chat_screen.dart';
import '../../screens/agency/recruitment_screen.dart';
import '../../screens/agency/request_release_screen.dart';
import '../../screens/social/feed_screen.dart';
import '../../screens/avatar/avatar_builder_screen.dart';
import '../../screens/metaverse/metaverse_room_screen.dart';
import '../../screens/treasury/treasury_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/signup', builder: (_, __) => const SignupScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
      GoRoute(
        path: '/live/:streamId',
        builder: (_, state) =>
            LiveRoomScreen(streamId: state.pathParameters['streamId']!),
      ),
      GoRoute(path: '/go-live', builder: (_, __) => const LiveHostScreen()),
      GoRoute(
        path: '/pk/:streamId',
        builder: (_, state) =>
            PkBattleScreen(streamId: state.pathParameters['streamId']!),
      ),
      GoRoute(path: '/avatar-live', builder: (_, __) => const AvatarLiveScreen()),
      GoRoute(
        path: '/profile/:userId',
        builder: (_, state) =>
            ProfileScreen(userId: state.pathParameters['userId']!),
      ),
      GoRoute(path: '/wallet', builder: (_, __) => const WalletScreen()),
      GoRoute(path: '/withdraw', builder: (_, __) => const WithdrawScreen()),
      GoRoute(path: '/rankings', builder: (_, __) => const GlobalRankingScreen()),
      GoRoute(path: '/events', builder: (_, __) => const EventHubScreen()),
      GoRoute(path: '/games', builder: (_, __) => const GameHubScreen()),
      GoRoute(path: '/agency', builder: (_, __) => const AgencyDashboard()),
      GoRoute(path: '/agency/chat', builder: (_, __) => const AgencyChatScreen()),
      GoRoute(path: '/agency/recruit', builder: (_, __) => const RecruitmentScreen()),
      GoRoute(path: '/agency/release', builder: (_, __) => const RequestReleaseScreen()),
      GoRoute(path: '/social', builder: (_, __) => const FeedScreen()),
      GoRoute(path: '/avatar-studio', builder: (_, __) => const AvatarBuilderScreen()),
      GoRoute(path: '/metaverse', builder: (_, __) => const MetaverseRoomScreen()),
      GoRoute(path: '/treasury', builder: (_, __) => const TreasuryScreen()),
    ],
  );
});
