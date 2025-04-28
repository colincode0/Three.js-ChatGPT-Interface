import { useEffect } from "react";
import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

export default function OverlayCube() {
  useEffect(() => {
    // Create overlay div if it doesn't exist
    let container = document.getElementById("overlay-cube-canvas");
    if (!container) {
      container = document.createElement("div");
      container.id = "overlay-cube-canvas";
      container.style.position = "absolute";
      container.style.inset = "0";
      container.style.pointerEvents = "none";
      container.style.zIndex = "50";
      document.body.appendChild(container);
    }

    // Create scene, camera, renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 4;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    container.appendChild(renderer.domElement);

    const fontLoader = new FontLoader();
    fontLoader.load("/fonts/helvetiker_regular.typeface.json", (font) => {
      const createTextGeometry = () =>
        new TextGeometry("test", {
          font: font,
          size: 0.5,
          height: 0.05,
          curveSegments: 12,
          bevelEnabled: true,
          bevelThickness: 0.01,
          bevelSize: 0.005,
          bevelSegments: 3,
        });

      const textGeometry = createTextGeometry();

      // Center geometry
      textGeometry.computeBoundingBox();
      const textWidth =
        textGeometry.boundingBox!.max.x - textGeometry.boundingBox!.min.x;
      textGeometry.translate(-textWidth / 2, -0.25, 0);

      // Create material
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.3,
        roughness: 0.2,
        clearcoat: 0.5,
        clearcoatRoughness: 0.1,
      });

      // Create mesh
      const textMesh = new THREE.Mesh(textGeometry, material);
      scene.add(textMesh);

      // Enhanced lighting for better depth perception
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
      mainLight.position.set(2, 2, 2);
      scene.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
      fillLight.position.set(-1, 0.5, -1);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
      rimLight.position.set(0, -2, -2);
      scene.add(rimLight);

      // Animation
      let running = true;
      let time = 0;
      let targetRotation = 0;
      const rotationSpeed = 0.005;
      const dampingFactor = 0.1;

      function animate() {
        if (!running) return;

        time += 0.01;

        // Smooth rotation with slight wobble
        const rotationDiff = targetRotation - textMesh.rotation.y;
        textMesh.rotation.y += rotationDiff * dampingFactor;
        targetRotation += rotationSpeed;

        // Add subtle floating motion
        textMesh.position.y = Math.sin(time) * 0.02;

        // Add slight tilt
        textMesh.rotation.x = Math.sin(time * 0.5) * 0.02;
        textMesh.rotation.z = Math.cos(time * 0.5) * 0.02;

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }
      animate();

      // Handle resize
      function handleResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      window.addEventListener("resize", handleResize);

      // Cleanup
      return () => {
        running = false;
        window.removeEventListener("resize", handleResize);
        renderer.dispose();
        textGeometry.dispose();
        material.dispose();
        if (container && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    });

    return () => {
      if (container && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return null;
}
