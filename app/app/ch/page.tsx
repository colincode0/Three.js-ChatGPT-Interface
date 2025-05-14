"use client";

// <reference types="three" />

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export default function CHPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.sortObjects = true;
    renderer.localClippingEnabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Add HDR environment map for lighting
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // Use built-in environment map
    // Available HDRs:
    //   'royal_esplanade_1k.hdr'
    //   'venice_sunset_1k.hdr'
    //   'warehouse_1k.hdr'
    //   'studio_small_08_1k.hdr'
    //   'night_1k.hdr'
    //   'quarry_01_1k.hdr'
    //   'dikhololo_night_1k.hdr'
    //   'lebombo_1k.hdr'
    //   'pisa_1k.hdr'
    //   'potsdamer_platz_1k.hdr'
    //   'spruit_sunrise_1k.hdr'
    //   'syferfontein_0d_clear_1k.hdr'
    //   'venice_sunset_1k.hdr'
    // See: https://github.com/mrdoob/three.js/tree/dev/examples/textures/equirectangular
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/quarry_01_1k.hdr",
      (texture: THREE.DataTexture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.environment = envMap;
        pmremGenerator.dispose();
      }
    );

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Dramatically lower light intensities to let HDR dominate
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.12);
    mainLight.position.set(5, 0, 7);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.08);
    fillLight.position.set(-5, 0, -7);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.05);
    rimLight.position.set(0, 0, -10);
    scene.add(rimLight);

    const ambientFill1 = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(ambientFill1);

    const ambientFill2 = new THREE.AmbientLight(0xffffff, 0.03);
    scene.add(ambientFill2);

    const pointLight = new THREE.PointLight(0xffffff, 0.1, 20);
    pointLight.position.set(3, 0, 3);
    scene.add(pointLight);

    // Load the new cam_res.glb model
    const loader = new GLTFLoader();
    loader.load(
      "/3d/cam/cam_res.glb",
      (gltf: GLTF) => {
        const model = gltf.scene;

        // Center and fit model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Scale to fit view
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fitScale = 2 / maxDim;
        model.scale.setScalar(fitScale);

        // Ensure all textures use sRGB encoding and fix material settings
        model.traverse((node: THREE.Object3D) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            const mats = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            mats.forEach((mat) => {
              if (mat && (mat as THREE.Material).isMaterial) {
                // Force double-sided rendering
                (mat as THREE.Material).side = THREE.DoubleSide;
                // Ensure proper depth sorting
                (mat as THREE.Material).depthWrite = true;
                (mat as THREE.Material).depthTest = true;
                // Disable transparency unless explicitly needed
                (mat as THREE.Material).transparent = false;
                (mat as THREE.Material).opacity = 1.0;
                // Handle textures if they exist
                const materialWithMap = mat as THREE.Material & {
                  map?: THREE.Texture;
                  emissiveMap?: THREE.Texture;
                };
                if (
                  materialWithMap.map &&
                  materialWithMap.map instanceof THREE.Texture
                ) {
                  materialWithMap.map.needsUpdate = true;
                }
                if (
                  materialWithMap.emissiveMap &&
                  materialWithMap.emissiveMap instanceof THREE.Texture
                ) {
                  materialWithMap.emissiveMap.needsUpdate = true;
                }
              }
            });
          }
        });

        scene.add(model);
        setLoading(false);

        camera.position.set(0, 0, 4);
        controls.target.set(0, 0, 0);
        controls.update();
      },
      undefined,
      () => {
        setError(
          "Failed to load 3D model. Please check the console for details."
        );
        setLoading(false);
      }
    );

    // --- Postprocessing: Bloom ---
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    // Subtle bloom: strength, radius, threshold
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.18, // strength (subtle)
      0.4, // radius
      0.85 // threshold
    );
    composer.addPass(bloomPass);

    // Animation loop (use composer)
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      composer.render();
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      composer.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full bg-white">
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <div className="text-black text-xl">Loading 3D model...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <div className="text-red-500 text-xl">{error}</div>
        </div>
      )}
    </div>
  );
}
