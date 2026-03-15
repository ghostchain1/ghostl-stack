import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_config.dart';
import '../../services/auth_service.dart';
import '../../models/user_model.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  const AuthState({this.status = AuthStatus.unknown, this.user});
  final AuthStatus status;
  final UserModel? user;
  bool get isAuthenticated => status == AuthStatus.authenticated;
  AuthState copyWith({AuthStatus? status, UserModel? user}) =>
      AuthState(status: status ?? this.status, user: user ?? this.user);
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    _init();
  }

  Future<void> _init() async {
    final token = await AppConfig.getAuthToken();
    if (token != null && token.isNotEmpty) {
      state = state.copyWith(status: AuthStatus.authenticated);
    } else {
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  Future<bool> login(String email, String password) async {
    try {
      final user = await AuthService.instance.login(email, password);
      await AppConfig.setAuthToken(user.id); // token stored internally by AuthService
      state = AuthState(status: AuthStatus.authenticated, user: user);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> signup(String username, String email, String password) async {
    try {
      final user = await AuthService.instance.register(
        username: username,
        email: email,
        password: password,
      );
      await AppConfig.setAuthToken(user.id);
      state = AuthState(status: AuthStatus.authenticated, user: user);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    await AppConfig.clearSession();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void updateUser(UserModel user) {
    state = state.copyWith(user: user);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (_) => AuthNotifier(),
);

final isAuthenticatedProvider = Provider<bool>(
  (ref) => ref.watch(authProvider).isAuthenticated,
);

final currentUserProvider = Provider<UserModel?>(
  (ref) => ref.watch(authProvider).user,
);
