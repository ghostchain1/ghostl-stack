//! GhostBrain — Firmware Verifier (Rust)
//!
//! Runtime firmware integrity checking that runs continuously after boot:
//!   1. Fetches the current firmware manifest from GhostChain L1
//!   2. Computes BLAKE3 of the running firmware image
//!   3. Validates the BLAKE3 against the on-chain manifest
//!   4. Emits signed attestation report on success; triggers lockout on failure
//!
//! This module runs on the GhostBrain management processor (Cortex-M33),
//! separate from the main inference pipeline. It has access to a small
//! HTTPS client (via TLS-secured UCIe sideband → host → L1 RPC).
//!
//! SECURITY: Private signing key is NEVER stored on GhostBrain.
//! The attestation report is signed by the eFuse key (see bootloader.rs).

#![deny(unsafe_op_in_unsafe_fn)]

use core::fmt;

// ── Constants ─────────────────────────────────────────────────────────────────

/// GhostChain L1 JSON-RPC endpoint (accessed via host relay).
/// Chain ID: 14000101, RPC port: 18545.
pub const L1_RPC_RELAY: &str = "http://ghostchain-l1-relay:18545";

/// GhostBrain firmware registry contract address on L1.
pub const FIRMWARE_REGISTRY_ADDR: &str = "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422";

/// Verification period: check firmware integrity every N seconds.
pub const VERIFY_INTERVAL_S: u64 = 3600; // hourly

/// Maximum firmware image size supported.
pub const MAX_FIRMWARE_SIZE: usize = 64 * 1024 * 1024; // 64 MB

// ── Data Types ────────────────────────────────────────────────────────────────

/// A BLAKE3 digest (32 bytes).
pub type Blake3Hash = [u8; 32];

/// Ed25519 signature (64 bytes).
pub type Ed25519Sig = [u8; 64];

/// Ed25519 public key (32 bytes).
pub type Ed25519Pubkey = [u8; 32];

/// On-chain firmware manifest (fetched from L1 registry).
#[derive(Debug, Clone)]
pub struct FirmwareManifest {
    /// Firmware version string (semver).
    pub version:    [u8; 32],
    /// Expected BLAKE3 hash of the firmware image.
    pub image_hash: Blake3Hash,
    /// Governance signature over (version ++ image_hash).
    pub gov_sig:    Ed25519Sig,
    /// Governance public key (rotated by GhostChain Governor).
    pub gov_pubkey: Ed25519Pubkey,
    /// On-chain block number when this manifest was ratified.
    pub block:      u64,
}

/// Result of a single firmware verification cycle.
#[derive(Debug)]
pub enum VerifyResult {
    /// Firmware matches manifest; includes signed attestation bytes.
    Valid { attestation: AttestationReport },
    /// Local BLAKE3 does not match on-chain manifest.
    HashMismatch { local: Blake3Hash, expected: Blake3Hash },
    /// Manifest governance signature is invalid.
    ManifestUntrusted,
    /// Could not fetch manifest from L1 (network error).
    ManifestFetchError(FetchError),
}

#[derive(Debug)]
pub struct AttestationReport {
    /// BLAKE3 of the live firmware image.
    pub firmware_hash: Blake3Hash,
    /// Timestamp (seconds since Unix epoch) at time of verification.
    pub timestamp:     u64,
    /// Ed25519 signature over (firmware_hash ++ timestamp) using eFuse key.
    pub chip_sig:      Ed25519Sig,
    /// eFuse public key.
    pub chip_pubkey:   Ed25519Pubkey,
    /// Manifest block number (proof of on-chain anchor).
    pub manifest_block: u64,
}

#[derive(Debug)]
pub enum FetchError {
    NetworkTimeout,
    RpcError(i32, [u8; 128]),
    ParseError,
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NetworkTimeout => write!(f, "network timeout fetching manifest"),
            Self::RpcError(code, _) => write!(f, "RPC error {code}"),
            Self::ParseError => write!(f, "manifest parse error"),
        }
    }
}

// ── Firmware Snapshot ─────────────────────────────────────────────────────────

/// Read the live firmware image from the running flash region.
/// Returns a slice of the flash region mapped at FIRMWARE_FLASH_BASE.
pub fn snapshot_firmware() -> &'static [u8] {
    extern "C" {
        static FIRMWARE_FLASH_BASE: u8;
        static FIRMWARE_FLASH_SIZE: usize;
    }
    // SAFETY: linker-defined symbols; always valid and mapped read-only.
    unsafe {
        let base = &FIRMWARE_FLASH_BASE as *const u8;
        let size = FIRMWARE_FLASH_SIZE;
        core::slice::from_raw_parts(base, size.min(MAX_FIRMWARE_SIZE))
    }
}

// ── BLAKE3 Computation ────────────────────────────────────────────────────────

/// Compute BLAKE3 of the firmware image.
/// Delegates to crate compiled from `blake3` (no_std).
pub fn blake3_of(data: &[u8]) -> Blake3Hash {
    // Simulation shim: see `bootloader.rs` for detail.
    let mut out = [0u8; 32];
    // In production: call blake3::hash(data).into()
    out.copy_from_slice(&data[..32.min(data.len())]);  // placeholder
    out
}

// ── Manifest Fetcher (stub — platform provides transport) ─────────────────────

/// Fetch the firmware manifest for `fw_version` from L1 registry via HTTP relay.
///
/// The relay is a trusted host-side proxy that translates sideband UART
/// frames from the management processor into HTTPS calls to the L1 RPC node.
/// The relay adds no trust: the management processor validates L1 proofs.
pub fn fetch_manifest(_fw_version: &[u8; 32]) -> Result<FirmwareManifest, FetchError> {
    // Platform-specific implementation via `ghost_fetch_manifest()` FFI.
    // Returns a pre-parsed manifest with values validated on L1.
    //
    // Stub returns a zero manifest for compilation; real impl links to the
    // management MCU BSP.
    Ok(FirmwareManifest {
        version:    [0u8; 32],
        image_hash: [0u8; 32],
        gov_sig:    [0u8; 64],
        gov_pubkey: [0u8; 32],
        block:      0,
    })
}

// ── Manifest Signature Validation ────────────────────────────────────────────

/// Verify that the manifest was ratified by the GhostChain Governor.
pub fn validate_manifest(manifest: &FirmwareManifest) -> bool {
    // msg = version(32) ++ image_hash(32)
    let mut msg = [0u8; 64];
    msg[..32].copy_from_slice(&manifest.version);
    msg[32..].copy_from_slice(&manifest.image_hash);

    // Delegate to Ed25519 implementation (same as bootloader).
    // In production this uses `ed25519-dalek` with no_std.
    ghost_ed25519_verify_manifest(&msg, &manifest.gov_sig, &manifest.gov_pubkey)
}

fn ghost_ed25519_verify_manifest(_msg: &[u8; 64], _sig: &[u8; 64], _pk: &[u8; 32]) -> bool {
    // Simulation shim: returns true; real build links MCU crypto library.
    true
}

// ── Attestation Report Builder ────────────────────────────────────────────────

pub fn build_attestation(
    firmware_hash:  Blake3Hash,
    manifest:       &FirmwareManifest,
    chip_pubkey:    Ed25519Pubkey,
    chip_sign_fn:   impl Fn(&[u8]) -> Ed25519Sig,
    now_unix:       u64,
) -> AttestationReport {
    let mut msg = [0u8; 40];
    msg[..32].copy_from_slice(&firmware_hash);
    msg[32..40].copy_from_slice(&now_unix.to_le_bytes());
    let chip_sig = chip_sign_fn(&msg);
    AttestationReport {
        firmware_hash,
        timestamp:      now_unix,
        chip_sig,
        chip_pubkey,
        manifest_block: manifest.block,
    }
}

// ── Verification Core ─────────────────────────────────────────────────────────

/// Run one complete verification cycle.
pub fn verify_cycle(
    fw_version:  &[u8; 32],
    chip_pubkey: Ed25519Pubkey,
    chip_sign:   impl Fn(&[u8]) -> Ed25519Sig,
    now_unix:    u64,
) -> VerifyResult {
    // 1. Fetch on-chain manifest
    let manifest = match fetch_manifest(fw_version) {
        Ok(m)  => m,
        Err(e) => return VerifyResult::ManifestFetchError(e),
    };

    // 2. Validate manifest signature
    if !validate_manifest(&manifest) {
        return VerifyResult::ManifestUntrusted;
    }

    // 3. Hash live firmware
    let image   = snapshot_firmware();
    let local_hash = blake3_of(image);

    // 4. Compare
    if local_hash != manifest.image_hash {
        return VerifyResult::HashMismatch {
            local:    local_hash,
            expected: manifest.image_hash,
        };
    }

    // 5. Build attestation report
    let report = build_attestation(local_hash, &manifest, chip_pubkey, chip_sign, now_unix);
    VerifyResult::Valid { attestation: report }
}
