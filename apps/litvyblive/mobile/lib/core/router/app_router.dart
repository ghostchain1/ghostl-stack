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
import '../../screens/discovery/discovery_screen.dart';
import '../../screens/launchpad/launchpad_screen.dart';
import '../../screens/league/league_screen.dart';
import '../../screens/league/competition_screen.dart';
import '../../screens/settings/settings_screen.dart';
import '../../screens/notifications/notifications_screen.dart';
import '../../screens/creator/creator_earnings_screen.dart';
import '../../screens/avatar/avatar_screen.dart';
import '../../screens/insights/creator_insights.dart';
import '../../screens/live/multihost_screen.dart';
import '../../screens/wallet/buy_gst_screen.dart';
import '../../screens/wallet/transaction_history.dart';
import '../../screens/league/leaderboard_screen.dart';
import '../../screens/profile/followers_screen.dart';
import '../../screens/system/system_status.dart';
import '../../screens/promotions/event_promotions.dart';
import '../../screens/promotions/featured_creators.dart';
import '../../screens/promotions/trending_streams.dart';

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
      GoRoute(path: '/discovery', builder: (_, __) => const DiscoveryScreen()),
      GoRoute(path: '/launchpad', builder: (_, __) => const LaunchpadScreen()),
      GoRoute(path: '/league', builder: (_, __) => const LeagueScreen()),
      GoRoute(
        path: '/league/competition/:creatorId',
        builder: (_, state) =>
            CompetitionScreen(creatorId: state.pathParameters['creatorId']!),
      ),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/creator/earnings', builder: (_, __) => const CreatorEarningsScreen()),
      GoRoute(path: '/avatar', builder: (_, __) => const AvatarScreen()),
      GoRoute(path: '/insights', builder: (_, __) => const CreatorInsightsScreen()),
      GoRoute(
        path: '/multihost/:streamId',
        builder: (_, state) =>
            MultiHostScreen(streamId: state.pathParameters['streamId']!),
      ),
      GoRoute(path: '/wallet/buy', builder: (_, __) => const BuyGSTScreen()),
      GoRoute(path: '/wallet/history', builder: (_, __) => const TransactionHistoryScreen()),
      GoRoute(path: '/league/leaderboard', builder: (_, __) => const LeaderboardScreen()),
      GoRoute(
        path: '/profile/:userId/followers',
        builder: (_, state) =>
            FollowersScreen(userId: state.pathParameters['userId']!),
      ),
      GoRoute(path: '/system', builder: (_, __) => const SystemStatusScreen()),
      GoRoute(path: '/promotions', builder: (_, __) => const EventPromotionsScreen()),
      GoRoute(path: '/promotions/creators', builder: (_, __) => const FeaturedCreatorsScreen()),
      GoRoute(path: '/social/trending', builder: (_, __) => const TrendingStreamsScreen()),
    ],
  );
});
