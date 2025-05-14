"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

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
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    // Enable proper depth sorting
    renderer.sortObjects = true;
    renderer.localClippingEnabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Enhanced lighting setup
    // Stronger ambient light for overall brightness
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // Softer directional lights for subtle shadows
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(5, 10, 7);
    mainLight.castShadow = true;
    scene.add(mainLight);

    // Softer fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-5, 5, -7);
    scene.add(fillLight);

    // Very subtle rim light
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, 0, -10);
    scene.add(rimLight);

    // Additional ambient fill lights for more even illumination
    const ambientFill1 = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientFill1);

    const ambientFill2 = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientFill2);

    // Subtle point light for extra dimension
    const pointLight = new THREE.PointLight(0xffffff, 1.0, 20);
    pointLight.position.set(3, 3, 3);
    scene.add(pointLight);

    // Load the new cam_res.glb model
    const loader = new GLTFLoader();
    loader.load(
      "/3d/cam/cam_res.glb",
      (gltf) => {
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
        model.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            const mats = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            mats.forEach((mat) => {
              if (mat) {
                // Force double-sided rendering
                mat.side = THREE.DoubleSide;
                // Ensure proper depth sorting
                mat.depthWrite = true;
                mat.depthTest = true;
                // Disable transparency unless explicitly needed
                mat.transparent = false;
                mat.opacity = 1.0;

                // Handle textures if they exist
                if ("map" in mat && mat.map) {
                  mat.map.encoding = THREE.sRGBEncoding;
                  mat.map.needsUpdate = true;
                }
                if ("emissiveMap" in mat && mat.emissiveMap) {
                  mat.emissiveMap.encoding = THREE.sRGBEncoding;
                  mat.emissiveMap.needsUpdate = true;
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
      (err) => {
        setError(
          "Failed to load 3D model. Please check the console for details."
        );
        setLoading(false);
      }
    );

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
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
