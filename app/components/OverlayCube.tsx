import { useEffect, useState } from "react";
import * as THREE from "three";
import {
  TextGeometry,
  TextGeometryParameters,
} from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { UseChatHelpers } from "ai/react";

interface ExtendedTextGeometryParameters extends TextGeometryParameters {
  height: number;
}

interface OverlayCubeProps {
  chatProps: UseChatHelpers;
}

function cleanText(text: string): string {
  // Remove any leading prompt text and numbering
  const cleanedText = text
    .replace(/^Sure,.*?\n\n/g, "") // Remove "Sure, here are..." intro
    .replace(/^\d+\.\s*/gm, "") // Remove numbering
    .replace(/\\n/g, " ") // Replace literal \n with space
    .replace(/\n/g, " ") // Replace actual newlines with space
    .trim();

  console.log("Cleaned text:", cleanedText);
  return cleanedText;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  // Clean the text first
  const cleanedText = cleanText(text);
  console.log("Wrapping text:", cleanedText);
  console.log("Max chars per line:", maxCharsPerLine);

  const words = cleanedText.split(" ").filter((word) => word.length > 0);
  const lines: string[] = [];
  let currentLine = "";
  let currentLineLength = 0;

  for (const word of words) {
    const wordLength = word.length;
    if (currentLineLength + wordLength + 1 <= maxCharsPerLine) {
      if (currentLine) {
        currentLine += " " + word;
        currentLineLength += wordLength + 1;
      } else {
        currentLine = word;
        currentLineLength = wordLength;
      }
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      currentLineLength = wordLength;
    }
  }
  if (currentLine) lines.push(currentLine);

  console.log("Wrapped lines:", lines);
  console.log("Number of lines:", lines.length);
  return lines;
}

export default function OverlayCube({ chatProps }: OverlayCubeProps) {
  const { messages, isLoading: isChatLoading } = chatProps;
  const [currentText, setCurrentText] = useState("Welcome");
  const [updateTextFn, setUpdateTextFn] = useState<
    ((text: string) => void) | null
  >(null);

  // Update text when messages change and loading is complete
  useEffect(() => {
    if (messages.length > 0 && !isChatLoading) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant") {
        console.log("Original message:", lastMessage.content);
        setCurrentText(lastMessage.content);
      }
    }
  }, [messages, isChatLoading]);

  // Update 3D text when currentText changes
  useEffect(() => {
    if (updateTextFn) {
      updateTextFn(currentText);
    }
  }, [currentText, updateTextFn]);

  useEffect(() => {
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0, // Reduced metalness for whiter appearance
      roughness: 0.2, // Reduced roughness for more shine
      clearcoat: 0.0, // Removed clearcoat for pure white
      emissive: 0xffffff, // Added emissive for extra brightness
      emissiveIntensity: 0.2, // Subtle emission
    });

    const fontLoader = new FontLoader();
    fontLoader.load("/fonts/helvetiker_regular.typeface.json", (font) => {
      let currentMesh: THREE.Group | null = null;

      const createTextMesh = (text: string) => {
        console.log("Creating text mesh for:", text);
        const group = new THREE.Group();

        // Format settings
        const maxCharsPerLine = 38;
        const fontSize = 0.13;
        const lineSpacing = 1.4;

        console.log("Text settings:", {
          maxCharsPerLine,
          fontSize,
          lineSpacing,
        });

        // Process text into wrapped lines
        const lines = wrapText(text, maxCharsPerLine);
        console.log("Total number of lines:", lines.length);

        // Calculate total height of text block
        const totalHeight = (lines.length - 1) * (fontSize * lineSpacing);

        // Adjust starting position based on total height
        // Move text up so the first line starts near the top of the view
        const startY = totalHeight * 0.8; // This will push text up

        console.log("Text block dimensions:", {
          totalHeight,
          startY,
          numberOfLines: lines.length,
        });

        // Create geometries for each line
        lines.forEach((line, index) => {
          const textGeometry = new TextGeometry(line, {
            font: font,
            size: fontSize,
            height: 0.05,
            curveSegments: 6,
            bevelEnabled: false,
          } as ExtendedTextGeometryParameters);

          textGeometry.computeBoundingBox();

          // Calculate horizontal centering
          const textWidth =
            textGeometry.boundingBox!.max.x - textGeometry.boundingBox!.min.x;
          const centerX = -textWidth / 2;
          const lineY = startY - index * fontSize * lineSpacing;

          console.log(`Line ${index + 1}:`, {
            text: line,
            width: textWidth,
            centerX,
            lineY,
          });

          // Create stroke effect
          const strokeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
          });
          const textMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.4,
            shininess: 100,
            flatShading: false,
          });

          // Create stroke meshes in 8 directions
          const strokeOffsets = [
            [-1, 1],
            [0, 1],
            [1, 1],
            [-1, 0],
            [1, 0],
            [-1, -1],
            [0, -1],
            [1, -1],
          ];

          const strokeSize = 0.003;

          strokeOffsets.forEach(([x, y]) => {
            const strokeMesh = new THREE.Mesh(textGeometry, strokeMaterial);
            strokeMesh.position.set(
              centerX + x * strokeSize,
              lineY + y * strokeSize,
              -0.001
            );
            strokeMesh.castShadow = true;
            group.add(strokeMesh);
          });

          // Main text mesh
          const textMesh = new THREE.Mesh(textGeometry, textMaterial);
          textMesh.position.set(centerX, lineY, 0);
          textMesh.castShadow = true;
          group.add(textMesh);
        });

        // Position the entire group
        group.position.z = 0.5;
        group.position.y = 0.6; // Move the entire group up more
        group.rotation.x = -0.1;

        return group;
      };

      // Create update function
      const updateText = (text: string) => {
        if (currentMesh) {
          scene.remove(currentMesh);
          currentMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
            }
          });
        }
        currentMesh = createTextMesh(text);
        scene.add(currentMesh);
      };

      // Set the update function
      setUpdateTextFn(() => updateText);

      // Create initial text mesh
      updateText(currentText);

      // Lighting adjustments with shadows
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
      mainLight.position.set(2, 2, 2);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      mainLight.shadow.camera.near = 0.1;
      mainLight.shadow.camera.far = 10;
      mainLight.shadow.camera.left = -5;
      mainLight.shadow.camera.right = 5;
      mainLight.shadow.camera.top = 5;
      mainLight.shadow.camera.bottom = -5;
      mainLight.shadow.bias = -0.001;
      scene.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
      fillLight.position.set(-2, -2, 2);
      scene.add(fillLight);

      const topLight = new THREE.DirectionalLight(0xffffff, 0.6);
      topLight.position.set(0, 5, 1);
      scene.add(topLight);

      // Animation
      let running = true;
      let time = 0;

      function animate() {
        if (!running) return;

        time += 0.01;

        if (currentMesh) {
          // Gentle left-right panning motion
          currentMesh.rotation.y = Math.sin(time * 0.5) * 0.1;
          // Subtle floating motion
          currentMesh.position.y += Math.sin(time) * 0.0001;
        }

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
        material.dispose();
        if (currentMesh) {
          currentMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
            }
          });
        }
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
