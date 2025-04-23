"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

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
  const composerRef = useRef<EffectComposer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add refs for animation and drift
  const startPositionRef = useRef(new THREE.Vector3());
  const targetPositionRef = useRef(new THREE.Vector3(1.5, 0, 0));
  const animationProgressRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const driftVelocityRef = useRef(new THREE.Vector3());
  const targetDriftVelocityRef = useRef(new THREE.Vector3());
  const driftStartTimeRef = useRef(0);
  const isDriftingRef = useRef(false);

  const moveToRandomView = () => {
    if (!cameraRef.current || !controlsRef.current || isAnimatingRef.current)
      return;

    // Store start position and generate new target
    startPositionRef.current.copy(cameraRef.current.position);
    const newPosition = getRandomPosition(cameraRef.current.position);
    targetPositionRef.current.copy(newPosition);

    // Calculate target drift velocity based on movement direction
    const moveDirection = new THREE.Vector3()
      .subVectors(targetPositionRef.current, startPositionRef.current)
      .normalize();
    const driftSpeed = 0.0002; // Very slow drift
    targetDriftVelocityRef.current.copy(
      moveDirection.multiplyScalar(driftSpeed)
    );
    driftVelocityRef.current.set(0, 0, 0); // Reset current drift velocity

    // Reset animation progress
    animationProgressRef.current = 0;
    isAnimatingRef.current = true;
    isDriftingRef.current = false;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    // Add subtle fog for atmospheric effect
    scene.fog = new THREE.FogExp2(0x000000, 0.15);

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

    // Setup post-processing
    const composer = new EffectComposer(renderer);
    composerRef.current = composer;

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Add bloom effect for glow
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.4, // reduced strength from 0.5
      0.5, // increased radius from 0.4 for softer glow
      0.9 // increased threshold from 0.85
    );
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.target.set(0, 0, 0);
    controls.update();

    // Softer ambient light
    const ambientLight = new THREE.AmbientLight(0x111111, 0.4); // reduced from 0.6
    scene.add(ambientLight);

    // Main soft light from front (more subtle)
    const frontLight = new THREE.PointLight(0xffffff, 0.8); // reduced from 1.5
    frontLight.position.set(0, 0, 2);
    scene.add(frontLight);

    // Subtle rim light from back
    const backLight = new THREE.PointLight(0x0066ff, 0.6); // reduced from 1.2
    backLight.position.set(0, 0, -2);
    scene.add(backLight);

    // Additional soft lights for atmosphere (removed previous top/bottom lights)

    // Add more blue lights in a distributed pattern
    const blueLightPositions = [
      // Upper hemisphere - spread much wider
      new THREE.Vector3(6, 3, 6),
      new THREE.Vector3(-6, 3, -6),
      new THREE.Vector3(-6, 3, 6),
      new THREE.Vector3(6, 3, -6),
      new THREE.Vector3(0, 5, 0),

      // Middle layer - spread in a wider circle
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(-8, 0, 0),
      new THREE.Vector3(0, 0, 8),
      new THREE.Vector3(0, 0, -8),
      new THREE.Vector3(5, 0, 5),
      new THREE.Vector3(-5, 0, -5),

      // Lower hemisphere - spread wider
      new THREE.Vector3(6, -3, 6),
      new THREE.Vector3(-6, -3, -6),
      new THREE.Vector3(-6, -3, 6),
      new THREE.Vector3(6, -3, -6),
      new THREE.Vector3(0, -5, 0),
    ];

    blueLightPositions.forEach((position) => {
      const blueLight = new THREE.PointLight(0x0066ff, 0.25); // reduced slightly more
      blueLight.position.copy(position);
      // Increase distance for wider spread
      blueLight.distance = 10;
      blueLight.decay = 1.5; // reduced decay for more spread
      scene.add(blueLight);
    });

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

    // Animation loop with custom easing and drift
    const animate = () => {
      requestAnimationFrame(animate);

      if (isAnimatingRef.current && camera) {
        // Update progress faster for more immediate response
        animationProgressRef.current += 0.006; // increased from 0.004

        if (animationProgressRef.current >= 1) {
          isAnimatingRef.current = false;
          isDriftingRef.current = true;
          driftStartTimeRef.current = Date.now();
          animationProgressRef.current = 1;

          // Start with full drift velocity immediately
          driftVelocityRef.current.copy(targetDriftVelocityRef.current);
        }

        // Custom easing function (reduced power for more fluid motion)
        const t = animationProgressRef.current;
        const easedProgress =
          t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

        // Interpolate position
        camera.position.lerpVectors(
          startPositionRef.current,
          targetPositionRef.current,
          easedProgress
        );
      }

      // Apply drift if active
      if (isDriftingRef.current && camera) {
        // Remove the drift ease-in
        camera.position.add(driftVelocityRef.current);

        // Keep the camera within reasonable bounds
        const distanceFromCenter = camera.position.length();
        if (distanceFromCenter > 2.5 || distanceFromCenter < 0.5) {
          // If we drift too far, move back towards a reasonable distance more quickly
          const idealPosition = camera.position
            .clone()
            .normalize()
            .multiplyScalar(1.5);
          camera.position.lerp(idealPosition, 0.02); // increased from 0.01 for faster correction
        }
      }

      controls.update();
      composer.render();
    };

    animate();

    const handleResize = () => {
      if (!camera || !renderer || !composer) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
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
