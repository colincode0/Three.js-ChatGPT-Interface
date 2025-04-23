"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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
  // Pre-create reusable vectors to avoid garbage collection
  const startPositionRef = useRef(new THREE.Vector3());
  const targetPositionRef = useRef(new THREE.Vector3(1.5, 0, 0));
  const driftVelocityRef = useRef(new THREE.Vector3());
  const targetDriftVelocityRef = useRef(new THREE.Vector3());
  const idealPosition = useRef(new THREE.Vector3());
  const tempVector = useRef(new THREE.Vector3());
  const chromaticPassRef = useRef<ShaderPass | null>(null);

  // Scene refs
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Animation state
  const animationProgressRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const driftStartTimeRef = useRef(0);
  const isDriftingRef = useRef(false);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    // Camera with optimized far plane
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100 // Reduced from default 2000
    );
    camera.position.copy(targetPositionRef.current);
    cameraRef.current = camera;

    // Renderer with optimized settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing setup
    const composer = new EffectComposer(renderer);
    composerRef.current = composer;

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Optimized bloom pass
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), // Half resolution
      0.5,
      0.8,
      0.85
    );
    bloomPass.threshold = 0.2;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.75;
    composer.addPass(bloomPass);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x111111, 0.4);
    scene.add(ambientLight);

    // White ambient fill light
    const whiteAmbient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(whiteAmbient);

    // Main light
    const mainLight = new THREE.PointLight(0x808080, 15.0); // Grey light
    mainLight.position.set(8, 4, 8);
    scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.PointLight(0x808080, 12.0); // Grey light
    fillLight.position.set(-6, 2, -6);
    scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.PointLight(0x808080, 8.0); // Grey light
    rimLight.position.set(0, 10, -10);
    scene.add(rimLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.target.set(0, 0, 0);
    controls.update();

    // Model loading
    const loader = new GLTFLoader();
    loader.load(
      "/3d/brain/scene.gltf",
      (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(15);

        // Use existing vector for center calculation
        const box = new THREE.Box3().setFromObject(model);
        box.getCenter(tempVector.current);
        model.position.sub(tempVector.current);

        scene.add(model);

        // Add outline with optimized settings
        const outlinePass = new OutlinePass(
          new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
          scene,
          camera
        );

        outlinePass.edgeStrength = 3.0;
        outlinePass.edgeGlow = 1.5;
        outlinePass.edgeThickness = 2.0;
        outlinePass.pulsePeriod = 0;
        outlinePass.visibleEdgeColor.set(0xffffff); // White outline
        outlinePass.hiddenEdgeColor.set(0xffffff); // White for hidden edges

        outlinePass.selectedObjects = [model];
        composer.addPass(outlinePass);

        // Add vignette effect
        const vignettePass = new ShaderPass(VignetteShader);
        vignettePass.uniforms["offset"].value = 0.95;
        vignettePass.uniforms["darkness"].value = 1.6;
        composer.addPass(vignettePass);

        // Add chromatic aberration with movement-based opacity
        const chromaticAberrationPass = new ShaderPass({
          uniforms: {
            tDiffuse: { value: null },
            rOffset: { value: new THREE.Vector2(-0.005, 0) },
            gOffset: { value: new THREE.Vector2(0.0, 0) },
            bOffset: { value: new THREE.Vector2(0.005, 0) },
            opacity: { value: 0.0 }, // Start with no effect
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform vec2 rOffset;
            uniform vec2 gOffset;
            uniform vec2 bOffset;
            uniform float opacity;
            varying vec2 vUv;
            void main() {
              vec4 cr = texture2D(tDiffuse, vUv + rOffset);
              vec4 cg = texture2D(tDiffuse, vUv + gOffset);
              vec4 cb = texture2D(tDiffuse, vUv + bOffset);
              
              // Create cyan, green, and blue separation
              vec4 chromatic = vec4(
                cr.g * 0.5 + cr.b,  // Cyan (half G + B)
                cg.g,               // Green
                cb.b,               // Blue
                cg.a
              );
              
              // Mix with reduced opacity
              gl_FragColor = mix(cg, chromatic, opacity * 0.7);
            }
          `,
        });
        composer.addPass(chromaticAberrationPass);

        // Store reference to chromatic aberration pass
        chromaticPassRef.current = chromaticAberrationPass;
      },
      undefined,
      (error) => {
        console.error("Error loading model:", error);
      }
    );

    // Optimized animation loop
    const animate = (currentTime: number) => {
      requestAnimationFrame(animate);

      const deltaTime = Math.min(currentTime - lastTimeRef.current, 32); // Cap at ~30fps
      lastTimeRef.current = currentTime;

      if (isAnimatingRef.current && camera) {
        animationProgressRef.current += 0.006 * (deltaTime / 16.67);

        if (animationProgressRef.current >= 1) {
          isAnimatingRef.current = false;
          // Start drift after 1.5 second delay
          setTimeout(() => {
            isDriftingRef.current = true;
            driftStartTimeRef.current = Date.now();
            driftVelocityRef.current.copy(targetDriftVelocityRef.current);
          }, 1500);
          animationProgressRef.current = 1;
        }

        const t = animationProgressRef.current;
        const easedProgress =
          t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

        // Fade in chromatic aberration during movement with custom timing
        let chromaticOpacity = 0;
        if (t < 0.4) {
          // Slower fade in (0 to 0.4)
          chromaticOpacity = (t / 0.4) * (t / 0.4); // Quadratic ease-in
        } else if (t < 0.6) {
          // Hold at full opacity (0.4 to 0.6)
          chromaticOpacity = 1.0;
        } else {
          // Quick fade out (0.6 to 1.0)
          const fadeOutProgress = (t - 0.6) / 0.4;
          chromaticOpacity =
            1.0 - fadeOutProgress * fadeOutProgress * fadeOutProgress; // Cubic ease-out
        }

        if (chromaticPassRef.current?.uniforms?.opacity) {
          chromaticPassRef.current.uniforms.opacity.value = chromaticOpacity;
        }

        camera.position.lerpVectors(
          startPositionRef.current,
          targetPositionRef.current,
          easedProgress
        );
      } else if (
        !isAnimatingRef.current &&
        !isDriftingRef.current &&
        chromaticPassRef.current?.uniforms?.opacity
      ) {
        // Ensure chromatic aberration is off when not moving
        chromaticPassRef.current.uniforms.opacity.value = 0;
      }

      if (isDriftingRef.current && camera) {
        camera.position.add(driftVelocityRef.current);

        const distanceFromCenter = camera.position.length();
        if (distanceFromCenter > 2.5 || distanceFromCenter < 0.5) {
          idealPosition.current
            .copy(camera.position)
            .normalize()
            .multiplyScalar(1.5);
          camera.position.lerp(idealPosition.current, 0.02);
        }
      }

      controls.update();
      composer.render();
    };

    animate(0);

    // Optimized resize handler
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

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }

      // Dispose of resources
      renderer.dispose();
      composer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          }
        }
      });
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
          onClick={() => {
            if (
              !cameraRef.current ||
              !controlsRef.current ||
              isAnimatingRef.current
            )
              return;

            startPositionRef.current.copy(cameraRef.current.position);
            tempVector.current = getRandomPosition(cameraRef.current.position);
            targetPositionRef.current.copy(tempVector.current);

            const moveDirection = tempVector.current
              .subVectors(targetPositionRef.current, startPositionRef.current)
              .normalize();
            const driftSpeed = 0.0002;
            targetDriftVelocityRef.current.copy(
              moveDirection.multiplyScalar(driftSpeed)
            );
            driftVelocityRef.current.set(0, 0, 0);

            animationProgressRef.current = 0;
            isAnimatingRef.current = true;
            isDriftingRef.current = false;
          }}
          className="px-6 py-3 bg-white bg-opacity-10 hover:bg-opacity-20 text-white rounded-full transition-all cursor-pointer"
        >
          Move Camera
        </button>
      </div>
    </div>
  );
}
