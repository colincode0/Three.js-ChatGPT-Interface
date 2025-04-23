"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Define camera positions with more extreme differences
const VIEWS = {
  view1: {
    position: new THREE.Vector3(2, 0, 0),
    target: new THREE.Vector3(0, 0, 0),
  },
  view2: {
    position: new THREE.Vector3(0, 2, 2),
    target: new THREE.Vector3(0, 0, 0),
  },
};

export default function Scene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add refs for animation
  const targetPositionRef = useRef(new THREE.Vector3(2, 0, 0));
  const isAnimatingRef = useRef(false);

  const moveToView = (view: keyof typeof VIEWS) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const targetView = VIEWS[view];
    targetPositionRef.current.copy(targetView.position);
    isAnimatingRef.current = true;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.copy(VIEWS.view1.position);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.target.copy(VIEWS.view1.target);
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    const loader = new GLTFLoader();
    loader.load(
      "/3d/brain/scene.gltf",
      (gltf) => {
        const model = gltf.scene;
        const scale = 15;
        model.scale.setScalar(scale);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        scene.add(model);
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

    // Animation loop with lerp
    const animate = () => {
      requestAnimationFrame(animate);

      if (isAnimatingRef.current && camera) {
        // Interpolate camera position
        camera.position.lerp(targetPositionRef.current, 0.02);

        // Check if we're close enough to stop animating
        if (camera.position.distanceTo(targetPositionRef.current) < 0.01) {
          isAnimatingRef.current = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!camera || !renderer) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-screen h-screen">
      <div
        ref={containerRef}
        className="absolute top-0 left-0 w-full h-full -z-10 overflow-hidden bg-black"
      />
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4 z-50">
        <button
          onClick={() => moveToView("view1")}
          className="px-6 py-3 bg-white bg-opacity-10 hover:bg-opacity-20 text-white rounded-full transition-all cursor-pointer"
        >
          View 1
        </button>
        <button
          onClick={() => moveToView("view2")}
          className="px-6 py-3 bg-white bg-opacity-10 hover:bg-opacity-20 text-white rounded-full transition-all cursor-pointer"
        >
          View 2
        </button>
      </div>
      {loading && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-white z-50">
          Loading model...
        </div>
      )}
      {error && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-red-500 z-50">
          {error}
        </div>
      )}
    </div>
  );
}
