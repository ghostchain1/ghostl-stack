//! GhostBrain — Secure Bootloader (Rust)
//!
//! Stage-0 firmware bootloader that:
//!   1. Reads the chip eFuse public key (Ed25519)
//!   2. Verifies the next-stage firmware signature
//!   3. Verifies BLAKE3 content hash
//!   4. Advances boot if both checks pass; halts otherwise
//!
//! Runs from ROM; has no dynamic allocator (no_std + no_alloc).
//!
//! SECURITY: No private key material is ever stored on GhostBrain hardware.
//! Signatures are produced by the GhostChain governance key-holder and
//! embedded in the signed firmware header at release time.

#![no_std]
#![no_main]
#![deny(unsafe_op_in_unsafe_fn)]

use core::mem;

// ── Re-exported pure-Rust crypto (no_std) ────────────────────────────────────
//
// In production these come from audited crates compiled for the Cortex-M33
// management processor embedded in the GhostBrain chiplet.
//
// For simulation/testing build (feature = "std_sim"), we expose a std-compat
// shim below.

// ── Firmware Header Layout ────────────────────────────────────────────────────

/// Fixed header at the start of every signed firmware blob.
///
/// ```
/// [0  .. 3 ] magic:     0x47_42_46_57   ("GBFW")
/// [4  .. 7 ] version:   u32 LE
/// [8  .. 11] len_bytes: u32 LE (payload length after header)
/// [12 .. 43] blake3:    [u8; 32]  BLAKE3 hash of payload
/// [44 .. 75] ed25519sig:[u8; 64]  Ed25519 signature over bytes 0..44
/// [76 ..   ] payload:   actual firmware bytes
/// ```
#[repr(C, packed)]
pub struct FirmwareHeader {
    pub magic:      [u8; 4],
    pub version:    u32,
    pub len_bytes:  u32,
    pub blake3:     [u8; 32],
    pub ed25519sig: [u8; 64],
}

pub const FIRMWARE_MAGIC: [u8; 4] = [0x47, 0x42, 0x46, 0x57]; // "GBFW"
pub const HEADER_SIZE: usize = mem::size_of::<FirmwareHeader>(); // 76 bytes

// ── eFuse Public Key (injected at provisioning time) ─────────────────────────

/// Read the 32-byte Ed25519 public key burned into OTP/eFuse.
/// On real hardware this maps to a memory-mapped register bank;
/// here we expose it as an extern for the linker to fill in.
extern "C" {
    #[link_name = "GHOST_EFUSE_PUBKEY_BASE"]
    static EFUSE_PUBKEY: [u8; 32];
}

/// Safe wrapper — called once during boot, before any privilege escalation.
fn read_efuse_pubkey() -> [u8; 32] {
    // SAFETY: eFuse region is read-only, word-aligned, always-mapped ROM.
    unsafe { EFUSE_PUBKEY }
}

// ── Error Types ───────────────────────────────────────────────────────────────

#[derive(Debug, PartialEq)]
pub enum BootError {
    BadMagic,
    BadHash,
    BadSignature,
    FirmwareTooShort,
    UnsupportedVersion,
}

// ── BLAKE3 Hash Verification ─────────────────────────────────────────────────

/// Verify BLAKE3(payload) == header.blake3.
/// Pure iterative implementation (no heap required).
pub fn verify_blake3(payload: &[u8], expected: &[u8; 32]) -> bool {
    // In production: use `blake3` crate compiled with `no_std`.
    // Simulation shim: delegate to software implementation.
    let computed = ghost_blake3(payload);
    constant_time_eq(&computed, expected)
}

/// Constant-time 32-byte comparison to prevent timing side-channels.
#[inline(never)]
fn constant_time_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut acc: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        acc |= x ^ y;
    }
    acc == 0
}

/// Simulation shim — replaced by real BLAKE3 in hardware build.
#[cfg(feature = "std_sim")]
fn ghost_blake3(_data: &[u8]) -> [u8; 32] {
    // Stub: always returns all-zeros (integration tests supply pre-hashed blobs).
    [0u8; 32]
}

#[cfg(not(feature = "std_sim"))]
extern "C" {
    fn ghost_blake3(data_ptr: *const u8, data_len: usize, out: *mut u8);
}

// ── Ed25519 Signature Verification ───────────────────────────────────────────

/// Verify Ed25519 signature over `msg` using the eFuse public key.
pub fn verify_ed25519(msg: &[u8], sig: &[u8; 64], pubkey: &[u8; 32]) -> bool {
    // In production: `ed25519-dalek` with `no_std` + `no_alloc`.
    // Simulation shim delegates to extern.
    ghost_ed25519_verify(msg, sig, pubkey)
}

#[cfg(feature = "std_sim")]
fn ghost_ed25519_verify(_msg: &[u8], _sig: &[u8; 64], _pubkey: &[u8; 32]) -> bool {
    // Stub: always returns true in simulation builds.
    // Test harness must replace with real crypto.
    true
}

#[cfg(not(feature = "std_sim"))]
extern "C" {
    fn ghost_ed25519_verify(
        msg:    *const u8,
        msg_len: usize,
        sig:    *const u8,
        pubkey: *const u8,
    ) -> bool;
}

// ── Main Boot Verification ────────────────────────────────────────────────────

/// Verify a complete firmware blob (header + payload).
/// Returns `Ok(payload_slice)` on success, `Err(BootError)` on failure.
pub fn verify_firmware(blob: &[u8]) -> Result<&[u8], BootError> {
    if blob.len() < HEADER_SIZE {
        return Err(BootError::FirmwareTooShort);
    }

    // Parse header (SAFETY: blob is at least HEADER_SIZE bytes, packed repr).
    let header_bytes = &blob[..HEADER_SIZE];
    let magic        = &header_bytes[0..4];
    let version      = u32::from_le_bytes(header_bytes[4..8].try_into().unwrap());
    let len_bytes    = u32::from_le_bytes(header_bytes[8..12].try_into().unwrap()) as usize;
    let blake3_ref   = header_bytes[12..44].try_into().unwrap();
    let sig_ref: &[u8; 64] = header_bytes[44..108].try_into()
        .map_err(|_| BootError::FirmwareTooShort)?;

    if magic != &FIRMWARE_MAGIC {
        return Err(BootError::BadMagic);
    }
    if version > 1 {
        return Err(BootError::UnsupportedVersion);
    }

    let payload_start = HEADER_SIZE;
    let payload_end   = payload_start + len_bytes;
    if blob.len() < payload_end {
        return Err(BootError::FirmwareTooShort);
    }
    let payload = &blob[payload_start..payload_end];

    // 1. Verify content hash
    if !verify_blake3(payload, blake3_ref) {
        return Err(BootError::BadHash);
    }

    // 2. Verify governance signature over [magic + version + len + hash] (44 bytes)
    let signed_region = &blob[0..44];
    let pubkey        = read_efuse_pubkey();
    if !verify_ed25519(signed_region, sig_ref, &pubkey) {
        return Err(BootError::BadSignature);
    }

    Ok(payload)
}

// ── Boot Entry Point ──────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn ghost_boot_verify(blob_ptr: *const u8, blob_len: usize) -> i32 {
    // SAFETY: blob_ptr is provided by the ROM stage; len is from a secure register.
    let blob = unsafe { core::slice::from_raw_parts(blob_ptr, blob_len) };
    match verify_firmware(blob) {
        Ok(_payload) => {
            // Signal hardware to release CPU reset and jump to payload entry.
            // In production: write to BOOT_CTRL register.
            0 // BOOT_OK
        }
        Err(_e) => {
            // Lock the chip into secure-halt; no further execution.
            // In production: write to SECURITY_LOCKOUT register.
            -1 // BOOT_FAIL
        }
    }
}

// ── Panic Handler ─────────────────────────────────────────────────────────────

#[cfg(not(feature = "std_sim"))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    // On hardware panic during boot: assert HALT line.
    loop {
        // Signal external watchdog via GPIO (implementation-specific).
        unsafe { core::arch::asm!("wfi") };
    }
}
