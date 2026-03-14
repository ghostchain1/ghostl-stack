"use client";

import { useRef, useEffect } from "react";

/**
 * GhostNetwork — WebGL particle field using Three.js canvas.
 * Gold circuit-node particles animate in a slow drift, simulating
 * the GhostChain AI neural network background.
 */
export default function GhostNetwork({ className = "" }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let animId: number;
    let renderer: import("three").WebGLRenderer;

    (async () => {
      const THREE = await import("three");
      const el = mountRef.current;
      if (!el) return;

      const W = el.clientWidth  || window.innerWidth;
      const H = el.clientHeight || window.innerHeight;

      // Scene
      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
      camera.position.z = 18;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      // ── Gold particles ───────────────────────────────────────
      const COUNT = 3000;
      const positions = new Float32Array(COUNT * 3);
      const velocities = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3]     = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
        velocities[i * 3]     = (Math.random() - 0.5) * 0.004;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.004;
        velocities[i * 3 + 2] = 0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        color: 0xFFD700,
        size: 0.06,
        transparent: true,
        opacity: 0.65,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geo, mat);
      scene.add(points);

      // ── Circuit lines (sparse connected nodes) ───────────────
      const lineMat = new THREE.LineBasicMaterial({ color: 0xFFAA00, opacity: 0.12, transparent: true });
      const lineCount = 80;
      for (let i = 0; i < lineCount; i++) {
        const a = Math.floor(Math.random() * COUNT);
        const b = Math.floor(Math.random() * COUNT);
        const lGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(positions[a*3], positions[a*3+1], positions[a*3+2]),
          new THREE.Vector3(positions[b*3], positions[b*3+1], positions[b*3+2]),
        ]);
        scene.add(new THREE.Line(lGeo, lineMat));
      }

      // ── Animate ──────────────────────────────────────────────
      const pos = geo.attributes.position as THREE.BufferAttribute;
      let t = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        t += 0.001;
        points.rotation.y = t * 0.06;
        points.rotation.x = Math.sin(t * 0.3) * 0.04;
        for (let i = 0; i < COUNT; i++) {
          (pos.array as Float32Array)[i*3]     += velocities[i*3];
          (pos.array as Float32Array)[i*3 + 1] += velocities[i*3 + 1];
          // wrap
          if (Math.abs((pos.array as Float32Array)[i*3])     > 20) velocities[i*3]     *= -1;
          if (Math.abs((pos.array as Float32Array)[i*3 + 1]) > 15) velocities[i*3 + 1] *= -1;
        }
        pos.needsUpdate = true;
        renderer.render(scene, camera);
      };
      animate();

      // ── Resize ───────────────────────────────────────────────
      const onResize = () => {
        if (!el) return;
        const W2 = el.clientWidth, H2 = el.clientHeight;
        camera.aspect = W2 / H2;
        camera.updateProjectionMatrix();
        renderer.setSize(W2, H2);
      };
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(animId);
        renderer.dispose();
        el.removeChild(renderer.domElement);
      };
    })();

    return () => {
      cancelAnimationFrame(animId);
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}
      aria-hidden="true"
    />
  );
}
