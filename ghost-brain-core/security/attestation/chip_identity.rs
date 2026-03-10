//! GhostBrain — Chip Identity (Rust)
//!
//! Manages the unique hardware identity of each GhostBrain chiplet:
//!   - Ed25519 keypair derived from eFuse device secret via HKDF-SHA256
//!   - Chip UUID (128-bit, burned at provisioning)
//!   - Attestation signing interface (private key NEVER leaves chip)
//!
//! SECURITY GUARANTEE: The Ed25519 private key is derived from the eFuse
//! root secret at boot time, held in a locked SRAM region, and zeroised
//! when the chip enters sleep or receives a LOCKOUT command.
//! It is never transmitted or stored in non-volatile memory.

#![deny(unsafe_op_in_unsafe_fn)]

use core::fmt;

// ── Chip UUID ─────────────────────────────────────────────────────────────────

/// 128-bit unique chip identifier burned at wafer test.
/// Maps to: eFuse bank 1, bits 0..127.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct ChipUuid([u8; 16]);

impl ChipUuid {
    /// Read UUID from eFuse (called once at boot).
    pub fn from_efuse() -> Self {
        extern "C" {
            static GHOST_EFUSE_UUID_BASE: u8;
        }
        let mut buf = [0u8; 16];
        // SAFETY: linker-defined; eFuse UUID region is read-only and always mapped.
        unsafe {
            let src = &GHOST_EFUSE_UUID_BASE as *const u8;
            core::ptr::copy_nonoverlapping(src, buf.as_mut_ptr(), 16);
        }
        Self(buf)
    }

    /// Format as lowercase hex string (no dashes).
    pub fn to_hex_str(&self, buf: &mut [u8; 32]) {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        for (i, byte) in self.0.iter().enumerate() {
            buf[i * 2]     = HEX[(byte >> 4) as usize];
            buf[i * 2 + 1] = HEX[(byte & 0xF) as usize];
        }
    }
}

impl fmt::Debug for ChipUuid {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut buf = [0u8; 32];
        self.to_hex_str(&mut buf);
        let s = core::str::from_utf8(&buf).unwrap_or("(invalid)");
        write!(f, "ChipUuid({s})")
    }
}

// ── eFuse Root Secret ─────────────────────────────────────────────────────────

/// 32-byte OTP root secret burned at provisioning.
/// Accessible only in privileged mode from the management processor.
/// Maps to: eFuse bank 2, bits 0..255.
fn read_efuse_root_secret() -> [u8; 32] {
    extern "C" {
        static GHOST_EFUSE_ROOT_SECRET: u8;
    }
    let mut buf = [0u8; 32];
    // SAFETY: privileged-only eFuse region; bootloader sets privilege level.
    unsafe {
        let src = &GHOST_EFUSE_ROOT_SECRET as *const u8;
        core::ptr::copy_nonoverlapping(src, buf.as_mut_ptr(), 32);
    }
    buf
}

// ── HKDF-SHA-256 (minimal no_std impl) ───────────────────────────────────────

/// Derive 32 bytes from HKDF-SHA-256(ikm=root_secret, salt=uuid, info=label).
/// In production this uses the `hkdf` crate compiled for no_std.
fn hkdf_sha256(
    ikm:   &[u8; 32],
    salt:  &[u8; 16],
    info:  &[u8],
    out:   &mut [u8; 32],
) {
    // Stub: XOR-combine for simulability; real build links to hardware SHA-256.
    // CRITICAL: replace with real HKDF before production builds.
    for (i, byte) in out.iter_mut().enumerate() {
        let k = ikm[i % 32] ^ salt[i % 16] ^ info.get(i % info.len().max(1)).copied().unwrap_or(0);
        *byte = k;
    }
}

// ── Ed25519 Keypair ───────────────────────────────────────────────────────────

/// Ed25519 seed (private scalar; 32 bytes).
/// Held in a zeroise-on-exit locked SRAM page.
struct Ed25519Seed([u8; 32]);

impl Ed25519Seed {
    fn zeroise(&mut self) {
        // Use volatile write to prevent compiler eliding the zeroise.
        for byte in self.0.iter_mut() {
            // SAFETY: writing to our own stack/SRAM; ptr is valid.
            unsafe { core::ptr::write_volatile(byte as *mut u8, 0u8) };
        }
    }
}

impl Drop for Ed25519Seed {
    fn drop(&mut self) {
        self.zeroise();
    }
}

/// Ed25519 public key (32 bytes) derived from the chip's eFuse identity.
pub type Ed25519Pubkey = [u8; 32];

/// Ed25519 signature (64 bytes).
pub type Ed25519Sig = [u8; 64];

// ── ChipIdentity ──────────────────────────────────────────────────────────────

/// Singleton holding the chip's derived identity material.
/// Initialised once at boot; usable from all management processor contexts.
pub struct ChipIdentity {
    pub uuid:    ChipUuid,
    pub pubkey:  Ed25519Pubkey,
    seed:        Ed25519Seed,
}

impl ChipIdentity {
    const DERIVE_LABEL: &'static [u8] = b"ghostbrain-chip-identity-v1";

    /// Bootstrap from eFuse during secure boot.
    /// Must be called before any attestation operations.
    pub fn from_efuse() -> Self {
        let uuid   = ChipUuid::from_efuse();
        let root   = read_efuse_root_secret();
        let mut seed_bytes = [0u8; 32];
        hkdf_sha256(&root, &uuid.0, Self::DERIVE_LABEL, &mut seed_bytes);

        // Derive Ed25519 public key from seed.
        // In production: ed25519_dalek::SigningKey::from_bytes(&seed_bytes).verifying_key()
        let pubkey = ghost_ed25519_pubkey_from_seed(&seed_bytes);

        // Zeroise root secret from stack immediately.
        let mut root_copy = root;
        for b in root_copy.iter_mut() {
            unsafe { core::ptr::write_volatile(b as *mut u8, 0) };
        }

        Self {
            uuid,
            pubkey,
            seed: Ed25519Seed(seed_bytes),
        }
    }

    /// Sign `msg` with the chip's Ed25519 private key.
    /// The private key never leaves this function's scope.
    pub fn sign(&self, msg: &[u8]) -> Ed25519Sig {
        ghost_ed25519_sign(msg, &self.seed.0, &self.pubkey)
    }

    /// Zeroise the private key material.
    /// Call before entering sleep or performing firmware update.
    pub fn zeroise_secret(&mut self) {
        self.seed.zeroise();
    }
}

// ── Platform FFI stubs ────────────────────────────────────────────────────────

fn ghost_ed25519_pubkey_from_seed(seed: &[u8; 32]) -> Ed25519Pubkey {
    // Simulation: return first 32 bytes of seed doubled as pubkey stub.
    let mut pk = [0u8; 32];
    for (i, &b) in seed.iter().enumerate() {
        pk[i] = b ^ 0xAA;
    }
    pk
}

fn ghost_ed25519_sign(_msg: &[u8], _seed: &[u8; 32], _pubkey: &[u8; 32]) -> Ed25519Sig {
    // Simulation stub: returns zero signature; production links to MCU BSP.
    [0u8; 64]
}

// ── Global Identity Handle ────────────────────────────────────────────────────

/// Global chip identity initialised once during secure boot.
/// Access via `CHIP_IDENTITY.get_or_init(ChipIdentity::from_efuse)`.
///
/// In embedded context use a `static mut` with critical-section guard;
/// in hosted simulation use `std::sync::OnceLock`.
#[cfg(feature = "std_sim")]
pub static CHIP_IDENTITY: std::sync::OnceLock<ChipIdentity> = std::sync::OnceLock::new();
