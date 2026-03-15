/** Ghost brand motion presets */

export const fadeIn = {
  initial:   { opacity: 0, y: 16 },
  animate:   { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" },
};

export const fadeInSlow = {
  initial:   { opacity: 0 },
  animate:   { opacity: 1 },
  transition: { duration: 1.2, ease: "easeOut" },
};

export const scaleIn = {
  initial:   { scale: 0.7, opacity: 0 },
  animate:   { scale: 1,   opacity: 1 },
  transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
};

export const glowPulse = {
  animate:    { boxShadow: ["0 0 8px rgba(255,215,0,0.3)", "0 0 28px rgba(255,215,0,0.8)", "0 0 8px rgba(255,215,0,0.3)"] },
  transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
};

export const coinSpin = {
  animate:    { rotateY: 360 },
  transition: { duration: 8, repeat: Infinity, ease: "linear" },
};

export const networkFlow = {
  animate:    { x: [0, 6, 0], opacity: [0.6, 1, 0.6] },
  transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};

export const splashSequence = {
  logo: {
    initial:    { scale: 0.5, opacity: 0 },
    animate:    { scale: 1,   opacity: 1 },
    transition: { duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
  text: {
    initial:    { opacity: 0, y: 20 },
    animate:    { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: 1.2 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.4, delay: 0.3 },
  },
};
