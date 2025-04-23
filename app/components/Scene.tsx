"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function Scene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Use a wider FOV for more immersive feel
    const camera = new THREE.PerspectiveCamera(
      90,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    renderer.setClearColor(0x000000, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Add controls with adjusted settings for immersive view
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2; // Slower rotation for more natural feel
    controls.maxDistance = 0.1; // Limit how far you can zoom out
    controls.minDistance = 0.01; // Limit how close you can zoom in

    // Enhanced lighting setup for atmospheric effect
    const ambientLight = new THREE.AmbientLight(0x0066ff, 0.2); // Blue tint
    scene.add(ambientLight);

    // Add multiple point lights for better depth
    const createPointLight = (
      x: number,
      y: number,
      z: number,
      intensity: number,
      color: number
    ) => {
      const light = new THREE.PointLight(color, intensity);
      light.position.set(x, y, z);
      return light;
    };

    scene.add(createPointLight(1, 1, 1, 0.5, 0x0066ff)); // Blue
    scene.add(createPointLight(-1, -1, -1, 0.3, 0xffffff)); // White
    scene.add(createPointLight(0, 1, 0, 0.4, 0x00ffff)); // Cyan

    // Load GLTF model
    const loader = new GLTFLoader();
    loader.load(
      "/3d/brain/scene.gltf",
      (gltf) => {
        const model = gltf.scene;

        // Scale up the model significantly to be "inside" it
        const scale = 15;
        model.scale.setScalar(scale);

        // Center the model around camera
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        scene.add(model);

        // Position camera inside the model
        camera.position.set(0, 0, 0.05);
        controls.target.set(0, 0, 0);

        setLoading(false);
      },
      (progress) => {
        console.log(
          "Loading progress:",
          (progress.loaded / progress.total) * 100,
          "%"
        );
      },
      (error) => {
        console.error("Error loading model:", error);
        setError("Failed to load 3D model");
        setLoading(false);
      }
    );

    // Animation
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      containerRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="fixed top-0 left-0 w-screen h-screen -z-10 overflow-hidden bg-black"
        style={{ pointerEvents: "auto" }}
      />
      {loading && (
        <div className="fixed top-0 left-0 w-screen h-screen flex items-center justify-center text-white">
          Loading model...
        </div>
      )}
      {error && (
        <div className="fixed top-0 left-0 w-screen h-screen flex items-center justify-center text-red-500">
          {error}
        </div>
      )}
    </>
  );
}
