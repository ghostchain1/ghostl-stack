import Database from 'better-sqlite3';
import path from 'path';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'litvyb.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      wallet_address TEXT UNIQUE,
      avatar_url TEXT DEFAULT '',
      level INTEGER DEFAULT 1,
      followers INTEGER DEFAULT 0,
      following INTEGER DEFAULT 0,
      total_gifts INTEGER DEFAULT 0,
      gst_balance REAL DEFAULT 0,
      staked_gst REAL DEFAULT 0,
      talent_score INTEGER DEFAULT 0,
      agency_id TEXT,
      is_host INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES users(id),
      title TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      is_avatar_mode INTEGER DEFAULT 0,
      is_pk_active INTEGER DEFAULT 0,
      opponent_stream_id TEXT,
      viewer_count INTEGER DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      is_live INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS gifts (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      sender_id TEXT NOT NULL REFERENCES users(id),
      gift_id TEXT NOT NULL,
      gift_name TEXT NOT NULL,
      price_gst INTEGER NOT NULL,
      tx_hash TEXT,
      chain_id INTEGER DEFAULT 903,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      commission_rate REAL DEFAULT 0.3,
      logo_url TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      reward_pool REAL DEFAULT 0,
      color_hex TEXT DEFAULT '#7B2FBE',
      icon_emoji TEXT DEFAULT '🏆',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      media_url TEXT,
      likes INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount_gst REAL NOT NULL,
      tx_hash TEXT,
      chain_id INTEGER DEFAULT 903,
      created_at TEXT NOT NULL
    );

    -- ── GhostChain Universal Identity ────────────────────────────────────────

    -- Extended profile data (bio, social links, L1 anchor)
    CREATE TABLE IF NOT EXISTS identity_profiles (
      user_id           TEXT PRIMARY KEY REFERENCES users(id),
      bio               TEXT NOT NULL DEFAULT '',
      social_links      TEXT NOT NULL DEFAULT '{}',
      creator_level     INTEGER NOT NULL DEFAULT 1,
      l1_anchor_tx_hash TEXT,
      updated_at        TEXT NOT NULL
    );

    -- Creator verification workflow (one row per user, upserted on re-request)
    CREATE TABLE IF NOT EXISTS creator_verifications (
      user_id      TEXT PRIMARY KEY REFERENCES users(id),
      status       TEXT NOT NULL DEFAULT 'pending',
      is_verified  INTEGER NOT NULL DEFAULT 0,
      badge_type   TEXT,
      requested_at TEXT NOT NULL,
      reviewed_at  TEXT,
      review_note  TEXT
    );

    -- Latest reputation snapshot per user (recomputed on significant events)
    CREATE TABLE IF NOT EXISTS reputation_snapshots (
      user_id     TEXT PRIMARY KEY REFERENCES users(id),
      total_score INTEGER NOT NULL DEFAULT 0,
      tier        TEXT NOT NULL DEFAULT 'bronze',
      badges_json TEXT NOT NULL DEFAULT '[]',
      computed_at TEXT NOT NULL
    );

    -- ── Creator Launchpad ────────────────────────────────────────────────────

    -- On-chain CreatorToken registry (one per creator)
    CREATE TABLE IF NOT EXISTS creator_tokens (
      id              TEXT PRIMARY KEY,
      creator_id      TEXT NOT NULL REFERENCES users(id),
      creator_wallet  TEXT NOT NULL,
      name            TEXT NOT NULL,
      symbol          TEXT NOT NULL,
      token_address   TEXT UNIQUE,
      max_supply      REAL NOT NULL,
      factory_tx_hash TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      launched_at     TEXT NOT NULL
    );

    -- Fan token sales opened by creators
    CREATE TABLE IF NOT EXISTS token_sales (
      id               TEXT PRIMARY KEY,
      token_id         TEXT NOT NULL REFERENCES creator_tokens(id),
      creator_id       TEXT NOT NULL REFERENCES users(id),
      price_gst        REAL NOT NULL,
      total_for_sale   REAL NOT NULL,
      sold             REAL NOT NULL DEFAULT 0,
      proceeds_claimed REAL NOT NULL DEFAULT 0,
      starts_at        TEXT NOT NULL,
      ends_at          TEXT NOT NULL,
      chain_sale_id    TEXT,
      created_at       TEXT NOT NULL
    );

    -- Individual fan purchase records
    CREATE TABLE IF NOT EXISTS token_purchases (
      id            TEXT PRIMARY KEY,
      sale_id       TEXT NOT NULL REFERENCES token_sales(id),
      buyer_id      TEXT NOT NULL REFERENCES users(id),
      buyer_wallet  TEXT NOT NULL,
      amount        REAL NOT NULL,
      gst_spent     REAL NOT NULL,
      tx_hash       TEXT,
      created_at    TEXT NOT NULL
    );

    -- Aggregated fan token holdings per user per token
    CREATE TABLE IF NOT EXISTS fan_holdings (
      user_id      TEXT NOT NULL REFERENCES users(id),
      token_id     TEXT NOT NULL REFERENCES creator_tokens(id),
      amount       REAL NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL,
      PRIMARY KEY (user_id, token_id)
    );

    -- Creator DAO proposals
    CREATE TABLE IF NOT EXISTS dao_proposals (
      id                TEXT PRIMARY KEY,
      token_id          TEXT NOT NULL REFERENCES creator_tokens(id),
      creator_id        TEXT NOT NULL REFERENCES users(id),
      proposer_id       TEXT NOT NULL REFERENCES users(id),
      description       TEXT NOT NULL,
      votes_for         REAL NOT NULL DEFAULT 0,
      votes_against     REAL NOT NULL DEFAULT 0,
      ends_at           TEXT NOT NULL,
      executed          INTEGER NOT NULL DEFAULT 0,
      chain_proposal_id TEXT,
      created_at        TEXT NOT NULL
    );

    -- DAO votes cast by fans
    CREATE TABLE IF NOT EXISTS dao_votes (
      id          TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES dao_proposals(id),
      voter_id    TEXT NOT NULL REFERENCES users(id),
      support     INTEGER NOT NULL,
      weight      REAL NOT NULL,
      tx_hash     TEXT,
      voted_at    TEXT NOT NULL,
      UNIQUE(proposal_id, voter_id)
    );

    -- ── GhostChain Multiverse ────────────────────────────────────────────────

    -- Connected virtual worlds
    CREATE TABLE IF NOT EXISTS multiverse_worlds (
      world_id         TEXT PRIMARY KEY,
      world_name       TEXT NOT NULL,
      api_endpoint     TEXT NOT NULL DEFAULT '',
      supported_assets TEXT NOT NULL DEFAULT '[]',
      status           TEXT NOT NULL DEFAULT 'active',
      created_at       TEXT NOT NULL
    );

    -- Per-creator avatar state in each world (one row per creator+world pair)
    CREATE TABLE IF NOT EXISTS avatar_states (
      creator_id      TEXT NOT NULL REFERENCES users(id),
      world_id        TEXT NOT NULL REFERENCES multiverse_worlds(world_id),
      avatar_model    TEXT NOT NULL DEFAULT '',
      animation_state TEXT NOT NULL DEFAULT '',
      updated_at      TEXT NOT NULL,
      PRIMARY KEY (creator_id, world_id)
    );

    -- GRC-721 NFT assets mapped to world permissions & metadata
    CREATE TABLE IF NOT EXISTS nft_assets (
      asset_id         TEXT PRIMARY KEY,
      token_id         TEXT NOT NULL UNIQUE,
      owner_wallet     TEXT NOT NULL,
      world_permissions TEXT NOT NULL DEFAULT '[]',
      metadata_uri     TEXT NOT NULL DEFAULT '',
      asset_type       TEXT NOT NULL DEFAULT 'nft',
      chain_id         INTEGER NOT NULL DEFAULT 903,
      created_at       TEXT NOT NULL
    );

    -- Virtual events (concerts, meetups, tournaments, exhibitions)
    CREATE TABLE IF NOT EXISTS virtual_events (
      event_id         TEXT PRIMARY KEY,
      creator_id       TEXT NOT NULL REFERENCES users(id),
      world_id         TEXT NOT NULL,
      title            TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      event_type       TEXT NOT NULL DEFAULT 'concert',
      ticket_price_gst REAL NOT NULL DEFAULT 0,
      max_tickets      INTEGER NOT NULL DEFAULT 0,
      tickets_sold     INTEGER NOT NULL DEFAULT 0,
      starts_at        TEXT NOT NULL,
      ends_at          TEXT NOT NULL,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT NOT NULL
    );

    -- Event ticket NFTs (one per fan purchase)
    CREATE TABLE IF NOT EXISTS event_tickets (
      ticket_id         TEXT PRIMARY KEY,
      event_id          TEXT NOT NULL REFERENCES virtual_events(event_id),
      owner_id          TEXT NOT NULL REFERENCES users(id),
      owner_wallet      TEXT NOT NULL,
      on_chain_token_id TEXT,
      purchased_at      TEXT NOT NULL
    );

    -- Gateway dispatch log (event routed to which worlds)
    CREATE TABLE IF NOT EXISTS gateway_dispatches (
      event_id      TEXT NOT NULL,
      world_id      TEXT NOT NULL,
      dispatched_at TEXT NOT NULL,
      PRIMARY KEY (event_id, world_id)
    );

    -- ── Global Creator Economy Engine ────────────────────────────────────────

    -- Raw metric snapshots collected per creator per period
    CREATE TABLE IF NOT EXISTS creator_metrics (
      snapshot_id       TEXT PRIMARY KEY,
      creator_id        TEXT NOT NULL REFERENCES users(id),
      period            TEXT NOT NULL CHECK(period IN ('daily','weekly','monthly')),
      viewer_count      REAL NOT NULL DEFAULT 0,
      gifts_received    REAL NOT NULL DEFAULT 0,
      followers_gained  REAL NOT NULL DEFAULT 0,
      stream_hours      REAL NOT NULL DEFAULT 0,
      performance_score REAL NOT NULL DEFAULT 0,
      recorded_at       TEXT NOT NULL
    );

    -- Monthly salary distribution cycles
    CREATE TABLE IF NOT EXISTS salary_cycles (
      cycle_id      TEXT PRIMARY KEY,
      period_label  TEXT NOT NULL UNIQUE,
      total_gst     REAL NOT NULL DEFAULT 0,
      creators_paid INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','processing','complete')),
      started_at    TEXT NOT NULL,
      completed_at  TEXT
    );

    -- Individual salary payouts per creator per cycle
    CREATE TABLE IF NOT EXISTS salary_payouts (
      payout_id    TEXT PRIMARY KEY,
      cycle_id     TEXT NOT NULL REFERENCES salary_cycles(cycle_id),
      creator_id   TEXT NOT NULL REFERENCES users(id),
      wallet       TEXT NOT NULL,
      tier         TEXT NOT NULL CHECK(tier IN ('bronze','silver','gold','elite')),
      amount_gst   REAL NOT NULL,
      tx_hash      TEXT,
      status       TEXT NOT NULL DEFAULT 'queued'
                     CHECK(status IN ('queued','processing','confirmed','failed')),
      scheduled_at TEXT NOT NULL,
      confirmed_at TEXT
    );

    -- Seasonal league seasons
    CREATE TABLE IF NOT EXISTS league_seasons (
      season_id   TEXT PRIMARY KEY,
      season_name TEXT NOT NULL,
      starts_at   TEXT NOT NULL,
      ends_at     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','closed'))
    );

    -- Creator standings within a season/tier
    CREATE TABLE IF NOT EXISTS league_standings (
      standing_id  TEXT PRIMARY KEY,
      season_id    TEXT NOT NULL REFERENCES league_seasons(season_id),
      creator_id   TEXT NOT NULL REFERENCES users(id),
      league_tier  TEXT NOT NULL CHECK(league_tier IN ('bronze','silver','gold','diamond','legend')),
      rank_in_tier INTEGER NOT NULL DEFAULT 0,
      score        REAL NOT NULL DEFAULT 0,
      promoted     INTEGER NOT NULL DEFAULT 0,
      relegated    INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL,
      UNIQUE (season_id, creator_id)
    );

    -- Competitions (gift battles, PK tournaments, engagement contests, game tournaments)
    CREATE TABLE IF NOT EXISTS competitions (
      competition_id   TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      type             TEXT NOT NULL
                         CHECK(type IN ('gift_battle','pk_tournament','engagement_contest','game_tournament')),
      cadence          TEXT NOT NULL CHECK(cadence IN ('weekly','monthly')),
      prize_pool_gst   REAL NOT NULL DEFAULT 0,
      max_participants INTEGER NOT NULL DEFAULT 0,
      entry_fee_gst    REAL NOT NULL DEFAULT 0,
      starts_at        TEXT NOT NULL,
      ends_at          TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'open'
                         CHECK(status IN ('open','in_progress','scoring','complete','cancelled')),
      created_at       TEXT NOT NULL
    );

    -- Creator entries per competition
    CREATE TABLE IF NOT EXISTS competition_entries (
      entry_id        TEXT PRIMARY KEY,
      competition_id  TEXT NOT NULL REFERENCES competitions(competition_id),
      creator_id      TEXT NOT NULL REFERENCES users(id),
      score           REAL NOT NULL DEFAULT 0,
      final_rank      INTEGER,
      prize_gst       REAL NOT NULL DEFAULT 0,
      prize_tx_hash   TEXT,
      prize_status    TEXT NOT NULL DEFAULT 'pending'
                        CHECK(prize_status IN ('pending','confirmed','failed')),
      entered_at      TEXT NOT NULL,
      UNIQUE (competition_id, creator_id)
    );

    -- GhostBrain promotion events
    CREATE TABLE IF NOT EXISTS promotion_events (
      event_id    TEXT PRIMARY KEY,
      creator_id  TEXT NOT NULL REFERENCES users(id),
      trigger     TEXT NOT NULL
                    CHECK(trigger IN ('viewer_growth','gift_volume','fan_engagement','manual')),
      action      TEXT NOT NULL
                    CHECK(action IN ('boost_discovery','featured_slot','trending_badge','front_page','collaboration_suggest')),
      score_delta REAL NOT NULL DEFAULT 0,
      expires_at  TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL
    );

    -- ── GhostBrain Marketing AI ──────────────────────────────────────────────

    -- Raw viral signal detections (one row per trigger event)
    CREATE TABLE IF NOT EXISTS viral_events (
      event_id     TEXT PRIMARY KEY,
      creator_id   TEXT NOT NULL REFERENCES users(id),
      signal       TEXT NOT NULL
                     CHECK(signal IN ('viewer_growth','gift_spike','chat_burst','follower_surge')),
      value        REAL NOT NULL,
      threshold    REAL NOT NULL,
      detected_at  TEXT NOT NULL
    );

    -- Currently trending creators (score accumulates, expires after 1 hr)
    CREATE TABLE IF NOT EXISTS trending_creators (
      creator_id  TEXT PRIMARY KEY REFERENCES users(id),
      signal      TEXT NOT NULL,
      score       REAL NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL
    );

    -- Marketing campaigns
    CREATE TABLE IF NOT EXISTS campaigns (
      campaign_id    TEXT PRIMARY KEY,
      creator_id     TEXT REFERENCES users(id),
      type           TEXT NOT NULL
                       CHECK(type IN ('new_creator_promo','viral_stream_boost','event_promotion','global_tournament')),
      title          TEXT NOT NULL,
      description    TEXT NOT NULL,
      budget_gst     REAL NOT NULL DEFAULT 0,
      spent_gst      REAL NOT NULL DEFAULT 0,
      starts_at      TEXT NOT NULL,
      ends_at        TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK(status IN ('scheduled','active','paused','complete','cancelled')),
      vault_tx_hash  TEXT,
      created_at     TEXT NOT NULL
    );

    -- Per-channel social dispatches for each campaign
    CREATE TABLE IF NOT EXISTS social_distributions (
      dist_id      TEXT PRIMARY KEY,
      campaign_id  TEXT NOT NULL REFERENCES campaigns(campaign_id),
      creator_id   TEXT NOT NULL REFERENCES users(id),
      channel      TEXT NOT NULL
                     CHECK(channel IN ('tiktok','instagram','youtube','x','discord','telegram')),
      content      TEXT NOT NULL,
      clip_url     TEXT,
      hashtags     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued'
                     CHECK(status IN ('queued','sent','failed')),
      sent_at      TEXT,
      created_at   TEXT NOT NULL
    );

    -- Hourly growth snapshots for the analytics dashboard
    CREATE TABLE IF NOT EXISTS growth_snapshots (
      snapshot_id         TEXT PRIMARY KEY,
      period_start        TEXT NOT NULL,
      period_end          TEXT NOT NULL,
      new_users           INTEGER NOT NULL DEFAULT 0,
      active_creators     INTEGER NOT NULL DEFAULT 0,
      total_gifts_gst     REAL NOT NULL DEFAULT 0,
      new_followers       INTEGER NOT NULL DEFAULT 0,
      campaigns_active    INTEGER NOT NULL DEFAULT 0,
      campaigns_complete  INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL
    );

    -- ── Global Payment Gateway ──────────────────────────────────────────────

    -- One row per payment attempt (fiat → GST)
    CREATE TABLE IF NOT EXISTS payment_transactions (
      tx_id           TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id),
      wallet_address  TEXT NOT NULL,
      payment_method  TEXT NOT NULL
                        CHECK(payment_method IN ('credit_card','apple_pay','google_pay','bank_transfer','crypto_wallet')),
      fiat_amount     REAL NOT NULL,
      fiat_currency   TEXT NOT NULL CHECK(fiat_currency IN ('USD','EUR','GBP','JPY','CAD','AUD')),
      usd_amount      REAL NOT NULL,
      gst_amount      REAL NOT NULL,
      gst_rate        REAL NOT NULL,
      provider_ref    TEXT,
      chain_tx_hash   TEXT,
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','processing','confirmed','failed','refunded','flagged')),
      fraud_score     REAL NOT NULL DEFAULT 0,
      flagged_reason  TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    -- Append-only event log for compliance audit trail
    CREATE TABLE IF NOT EXISTS payment_audit_log (
      log_id     TEXT PRIMARY KEY,
      tx_id      TEXT NOT NULL REFERENCES payment_transactions(tx_id),
      event      TEXT NOT NULL,
      status     TEXT NOT NULL,
      meta       TEXT NOT NULL DEFAULT '{}',
      logged_at  TEXT NOT NULL
    );

    -- Per-wallet GST credit records (mirrors on-chain for simulation mode)
    CREATE TABLE IF NOT EXISTS wallet_credits (
      credit_id      TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      gst_amount     REAL NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','confirmed','failed')),
      chain_tx_hash  TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    -- ── GhostBrain Defender — Security & Anti-Fraud AI ────────────────────────

    CREATE TABLE IF NOT EXISTS security_incidents (
      incident_id    TEXT PRIMARY KEY,
      type           TEXT NOT NULL
                       CHECK(type IN ('gift_fraud','bot_viewers','payment_fraud',
                                      'account_farm','anomaly','game_manipulation','manual')),
      severity       TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
      user_id        TEXT REFERENCES users(id),
      stream_id      TEXT,
      wallet_address TEXT,
      evidence       TEXT NOT NULL DEFAULT '{}',
      status         TEXT NOT NULL DEFAULT 'open'
                       CHECK(status IN ('open','investigating','resolved','dismissed')),
      response_taken TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flagged_accounts (
      flag_id      TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id),
      reason       TEXT NOT NULL,
      flag_type    TEXT NOT NULL
                     CHECK(flag_type IN ('gift_ring','bot','payment_fraud',
                                         'account_farm','anomaly','manual')),
      severity     TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
      frozen       INTEGER NOT NULL DEFAULT 0,
      frozen_until TEXT,
      evidence     TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      UNIQUE(user_id)
    );

    CREATE TABLE IF NOT EXISTS blocked_wallets (
      wallet_address TEXT PRIMARY KEY,
      reason         TEXT NOT NULL,
      blocked_by     TEXT NOT NULL,
      blocked_at     TEXT NOT NULL,
      expires_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS gift_events (
      event_id       TEXT PRIMARY KEY,
      sender_id      TEXT NOT NULL,
      recipient_id   TEXT NOT NULL,
      stream_id      TEXT NOT NULL,
      gst_amount     REAL NOT NULL,
      wallet_address TEXT NOT NULL,
      sent_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gift_events_sender    ON gift_events(sender_id);
    CREATE INDEX IF NOT EXISTS idx_gift_events_stream    ON gift_events(stream_id);
    CREATE INDEX IF NOT EXISTS idx_gift_events_sent_at   ON gift_events(sent_at);

    CREATE TABLE IF NOT EXISTS bot_detections (
      detection_id TEXT PRIMARY KEY,
      stream_id    TEXT NOT NULL,
      viewer_id    TEXT,
      ip_block     TEXT,
      signal_data  TEXT NOT NULL DEFAULT '{}',
      confidence   REAL NOT NULL DEFAULT 0,
      action_taken TEXT,
      detected_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bot_detections_stream ON bot_detections(stream_id);

    CREATE TABLE IF NOT EXISTS account_device_profiles (
      profile_id    TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id),
      fingerprint   TEXT NOT NULL,
      ip_subnet     TEXT NOT NULL,
      wallet_address TEXT,
      registered_at TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_adp_fingerprint ON account_device_profiles(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_adp_ip_subnet   ON account_device_profiles(ip_subnet);
    CREATE INDEX IF NOT EXISTS idx_adp_wallet      ON account_device_profiles(wallet_address);

    CREATE TABLE IF NOT EXISTS metric_samples (
      sample_id   TEXT PRIMARY KEY,
      entity_id   TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value       REAL NOT NULL,
      sampled_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_metric_samples_entity ON metric_samples(entity_id, metric_name);

    CREATE TABLE IF NOT EXISTS anomaly_alerts (
      alert_id    TEXT PRIMARY KEY,
      entity_id   TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      z_score     REAL NOT NULL,
      severity    TEXT NOT NULL,
      value       REAL NOT NULL,
      mean        REAL NOT NULL,
      std_dev     REAL NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_risk_assessments (
      assessment_id TEXT PRIMARY KEY,
      tx_id         TEXT REFERENCES payment_transactions(tx_id),
      user_id       TEXT NOT NULL,
      risk_score    REAL NOT NULL,
      risk_level    TEXT NOT NULL,
      signals       TEXT NOT NULL DEFAULT '[]',
      action        TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_chargebacks (
      chargeback_id TEXT PRIMARY KEY,
      tx_id         TEXT REFERENCES payment_transactions(tx_id),
      user_id       TEXT NOT NULL,
      amount        REAL NOT NULL,
      currency      TEXT NOT NULL,
      occurred_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS moderator_alerts (
      alert_id    TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id),
      stream_id   TEXT,
      threat_type TEXT NOT NULL,
      severity    TEXT NOT NULL,
      evidence    TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','acknowledged','resolved')),
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pager_events (
      pager_id    TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id),
      stream_id   TEXT,
      severity    TEXT NOT NULL,
      threat_type TEXT NOT NULL,
      evidence    TEXT NOT NULL DEFAULT '{}',
      paged_at    TEXT NOT NULL
    );

    -- ── GhostBrain Infrastructure Auto-Scaling ────────────────────────────────

    CREATE TABLE IF NOT EXISTS infrastructure_nodes (
      node_id        TEXT PRIMARY KEY,
      type           TEXT NOT NULL
                       CHECK(type IN ('streaming_node','api_node','ai_worker',
                                      'db_replica','redis_replica')),
      region         TEXT NOT NULL
                       CHECK(region IN ('US_EAST','US_WEST','EU_WEST','APAC')),
      status         TEXT NOT NULL DEFAULT 'provisioning'
                       CHECK(status IN ('provisioning','healthy','draining','terminated')),
      cpu_pct        REAL NOT NULL DEFAULT 0,
      memory_mb      REAL NOT NULL DEFAULT 0,
      active_streams INTEGER NOT NULL DEFAULT 0,
      connections    INTEGER NOT NULL DEFAULT 0,
      service_label  TEXT,
      provisioned_at TEXT NOT NULL,
      last_heartbeat TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_infra_nodes_type   ON infrastructure_nodes(type, status);
    CREATE INDEX IF NOT EXISTS idx_infra_nodes_region ON infrastructure_nodes(region, type);

    CREATE TABLE IF NOT EXISTS scaling_events (
      event_id    TEXT PRIMARY KEY,
      action      TEXT NOT NULL CHECK(action IN ('scale_up','scale_down')),
      node_type   TEXT NOT NULL,
      region      TEXT NOT NULL,
      node_id     TEXT,
      reason      TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scaling_events_type ON scaling_events(node_type, occurred_at);

    CREATE TABLE IF NOT EXISTS scaling_decisions (
      decision_id    TEXT PRIMARY KEY,
      node_type      TEXT NOT NULL,
      action         TEXT NOT NULL CHECK(action IN ('scale_up','scale_down')),
      node_id        TEXT,
      region         TEXT,
      reason         TEXT NOT NULL,
      pressure_level TEXT,
      decided_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scaling_decisions_time ON scaling_decisions(decided_at);

    CREATE TABLE IF NOT EXISTS load_metrics (
      sample_id      TEXT PRIMARY KEY,
      sampled_at     TEXT NOT NULL,
      cpu            REAL NOT NULL,
      heap_used_mb   REAL NOT NULL,
      rss_gb         REAL NOT NULL,
      active_streams INTEGER NOT NULL,
      total_viewers  INTEGER NOT NULL,
      api_rps        REAL NOT NULL,
      ai_queue_depth INTEGER NOT NULL,
      network_rx_mbps REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_load_metrics_time ON load_metrics(sampled_at);

    CREATE TABLE IF NOT EXISTS ai_service_telemetry (
      telemetry_id  TEXT PRIMARY KEY,
      service       TEXT NOT NULL
                      CHECK(service IN ('matchmaking','moderation','marketing','fraud')),
      queue_depth   INTEGER NOT NULL,
      avg_latency_ms REAL NOT NULL,
      recorded_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_telemetry_time ON ai_service_telemetry(service, recorded_at);

    CREATE TABLE IF NOT EXISTS viewer_surge_events (
      event_id    TEXT PRIMARY KEY,
      stream_id   TEXT NOT NULL,
      viewer_count INTEGER NOT NULL,
      detected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_request_log (
      log_id        TEXT PRIMARY KEY,
      method        TEXT NOT NULL,
      path          TEXT NOT NULL,
      status_code   INTEGER NOT NULL,
      payload_bytes INTEGER NOT NULL DEFAULT 0,
      duration_ms   REAL NOT NULL,
      logged_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_request_log_time ON api_request_log(logged_at);
  `);
}
