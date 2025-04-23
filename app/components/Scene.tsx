"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Function to generate random position near current position
const getRandomPosition = (currentPosition: THREE.Vector3) => {
  // Maximum angle change (in radians) per click
  const maxAngleChange = Math.PI / 4; // 45 degrees
  // Maximum distance to move from current position
  const maxDistance = 0.8;

  // Generate random offset within constraints
  const angleOffset = (Math.random() * 2 - 1) * maxAngleChange;
  const distanceOffset = Math.random() * maxDistance;

  // Convert current position to spherical coordinates
  const currentSpherical = new THREE.Spherical().setFromVector3(
    currentPosition
  );

  // Apply constrained random changes to spherical coordinates
  currentSpherical.phi = Math.max(
    0.1,
    Math.min(Math.PI - 0.1, currentSpherical.phi + angleOffset)
  );
  currentSpherical.theta += (Math.random() * 2 - 1) * maxAngleChange;
  currentSpherical.radius = Math.max(
    1,
    Math.min(2, currentSpherical.radius + distanceOffset)
  );

  // Convert back to Cartesian coordinates
  return new THREE.Vector3().setFromSpherical(currentSpherical);
};

export default function Scene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add refs for animation
  const startPositionRef = useRef(new THREE.Vector3());
  const targetPositionRef = useRef(new THREE.Vector3(1.5, 0, 0));
  const animationProgressRef = useRef(0);
  const isAnimatingRef = useRef(false);

  const moveToRandomView = () => {
    if (!cameraRef.current || !controlsRef.current || isAnimatingRef.current)
      return;

    // Store start position and generate new target
    startPositionRef.current.copy(cameraRef.current.position);
    const newPosition = getRandomPosition(cameraRef.current.position);
    targetPositionRef.current.copy(newPosition);

    // Reset animation progress
    animationProgressRef.current = 0;
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
    const initialPosition = new THREE.Vector3(1.5, 0, 0);
    camera.position.copy(initialPosition);
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
    controls.target.set(0, 0, 0);
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

    // Animation loop with custom easing
    const animate = () => {
      requestAnimationFrame(animate);

      if (isAnimatingRef.current && camera) {
        // Update progress
        animationProgressRef.current += 0.005; // Reduced from 0.0075 for even slower movement

        if (animationProgressRef.current >= 1) {
          isAnimatingRef.current = false;
          animationProgressRef.current = 1;
        }

        // Custom easing function (cubic ease-in-out for smoother deceleration)
        const t = animationProgressRef.current;
        const easedProgress =
          t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Interpolate position
        camera.position.lerpVectors(
          startPositionRef.current,
          targetPositionRef.current,
          easedProgress
        );
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
          onClick={moveToRandomView}
          className="px-6 py-3 bg-white bg-opacity-10 hover:bg-opacity-20 text-white rounded-full transition-all cursor-pointer"
        >
          Move Camera
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
