"use client";

import { useRef, useEffect } from "react";

interface GSTCoinProps {
  size?: number;
  className?: string;
}

/**
 * 3D rotating Ghost Token coin rendered with Three.js.
 * Falls back gracefully to a CSS-spun flat coin if WebGL is unavailable.
 */
export default function GST3D({ size = 280, className = "" }: GSTCoinProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let animId: number;
    let renderer: import("three").WebGLRenderer;

    (async () => {
      const THREE = await import("three");
      const el = mountRef.current;
      if (!el) return;

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.z = 5;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      // Coin body
      const coinGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.22, 64);
      const coinMat = new THREE.MeshStandardMaterial({
        color:     0xFFD700,
        metalness: 0.9,
        roughness: 0.15,
        envMapIntensity: 1.2,
      });
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.rotation.x = Math.PI / 2.2;
      scene.add(coin);

      // Coin rim
      const rimGeo = new THREE.TorusGeometry(1.8, 0.07, 16, 64);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0xFFAA00, metalness: 1, roughness: 0.1 });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2.2;
      scene.add(rim);

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const dirLight = new THREE.DirectionalLight(0xFFD700, 2.5);
      dirLight.position.set(3, 4, 5);
      scene.add(dirLight);
      const fillLight = new THREE.PointLight(0xFFAA00, 1.5, 20);
      fillLight.position.set(-3, -2, 3);
      scene.add(fillLight);
      const rimLight = new THREE.PointLight(0xffffff, 0.8, 10);
      rimLight.position.set(0, 4, -3);
      scene.add(rimLight);

      // Particles around coin
      const sparkCount = 200;
      const sparkPos = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r     = 2.2 + Math.random() * 1.2;
        sparkPos[i*3]   = Math.cos(angle) * r;
        sparkPos[i*3+1] = (Math.random() - 0.5) * 0.4;
        sparkPos[i*3+2] = Math.sin(angle) * r;
      }
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
      const sparkMat = new THREE.PointsMaterial({ color: 0xFFD700, size: 0.04, transparent: true, opacity: 0.7 });
      const sparks = new THREE.Points(sparkGeo, sparkMat);
      scene.add(sparks);

      let t = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        t += 0.012;
        coin.rotation.z  += 0.012;
        rim.rotation.z   += 0.012;
        sparks.rotation.y += 0.006;
        sparks.rotation.z = Math.sin(t * 0.5) * 0.1;
        sparkMat.opacity = 0.5 + Math.sin(t * 2) * 0.2;
        renderer.render(scene, camera);
      };
      animate();
    })();

    return () => {
      cancelAnimationFrame(animId);
      renderer?.dispose();
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: size, height: size, display: "inline-block" }}
      aria-label="Ghost Token 3D coin"
      role="img"
    />
  );
}
