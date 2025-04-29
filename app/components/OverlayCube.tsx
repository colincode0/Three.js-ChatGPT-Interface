import { useEffect, useState, useRef, useMemo } from "react";
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
  const [currentText, setCurrentText] = useState("");
  const [updateTextFn, setUpdateTextFn] = useState<
    ((text: string) => void) | null
  >(null);
  const textGroupRef = useRef<THREE.Group | null>(null);
  const scrollPositionRef = useRef(0);
  const maxScrollRef = useRef(0);

  // Create shader materials
  const materials = useMemo(() => {
    // Vertex shader
    const vertexShader = `
      varying vec2 vUv;
      varying vec4 vPosition;
      void main() {
        vUv = uv;
        vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
        vPosition = projectionMatrix * modelViewPosition;
        gl_Position = vPosition;
      }
    `;

    // Fragment shader with fade effect
    const fragmentShader = `
      varying vec2 vUv;
      varying vec4 vPosition;
      uniform vec3 color;

      void main() {
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Create materials
    const textMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        color: { value: new THREE.Color(0xffffff) },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });

    const strokeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        color: { value: new THREE.Color(0x000000) },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });

    return { textMaterial, strokeMaterial };
  }, []);

  // Update text when messages change and loading is complete
  useEffect(() => {
    if (messages.length > 0 && !isChatLoading) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant") {
        console.log("Original message:", lastMessage.content);
        setCurrentText(lastMessage.content);
        // Reset scroll position when new message arrives
        scrollPositionRef.current = 0.5;
        if (textGroupRef.current) {
          textGroupRef.current.position.y = 0.5; // Reset to initial position
        }
      }
    }
  }, [messages, isChatLoading]);

  // Update scroll handler with opposite direction
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (textGroupRef.current) {
        const scrollSpeed = 0.002;
        const delta = event.deltaY * scrollSpeed;
        const currentPos = textGroupRef.current.position.y;

        // Calculate boundaries with adaptive scaling
        const bottomY = 1.0; // Starting position stays fixed

        // Calculate adaptive multiplier based on text height
        // For shorter text (less than 2.0 units), use a smaller multiplier
        // For longer text, gradually increase the multiplier
        const baseMultiplier = 0.3; // Base multiplier for short text
        const heightThreshold = 2.0; // Threshold to determine "long" text
        let adaptiveMultiplier;

        if (maxScrollRef.current <= heightThreshold) {
          // Short text: use base multiplier
          adaptiveMultiplier = baseMultiplier;
        } else {
          // Long text: gradually increase multiplier based on length
          const extraHeight = maxScrollRef.current - heightThreshold;
          adaptiveMultiplier = baseMultiplier + extraHeight * 0.15;
        }

        const topY = bottomY + maxScrollRef.current * adaptiveMultiplier;

        // Calculate new position (add delta)
        let newPosition = currentPos + delta;

        // Clamp between bottom and top boundaries
        newPosition = Math.max(bottomY, Math.min(topY, newPosition));

        textGroupRef.current.position.y = newPosition;
        scrollPositionRef.current = newPosition;

        console.log("Scroll Debug:", {
          deltaY: event.deltaY,
          delta,
          currentPos,
          newPosition,
          topY,
          bottomY,
          totalHeight: maxScrollRef.current,
          adaptiveMultiplier,
          textLines: maxScrollRef.current / (0.1 * 1.4),
          direction: event.deltaY > 0 ? "scrolling down" : "scrolling up",
        });
      }
    };

    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

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

      // Add semi-transparent background div
      const backgroundDiv = document.createElement("div");
      backgroundDiv.style.position = "absolute";
      backgroundDiv.style.left = "50%";
      backgroundDiv.style.top = "50%";
      backgroundDiv.style.transform = "translate(-50%, -50%)";
      backgroundDiv.style.width = "80%";
      backgroundDiv.style.maxWidth = "700px";
      backgroundDiv.style.height = "60%";
      backgroundDiv.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      backgroundDiv.style.border = "1px solid rgba(255, 255, 255, 0.2)";
      backgroundDiv.style.zIndex = "1";

      container.appendChild(backgroundDiv);

      document.body.appendChild(container);
    }

    const scene = new THREE.Scene();

    // Calculate camera parameters based on div dimensions
    const divHeight = window.innerHeight * 0.6; // 60% of viewport height
    const divWidth = Math.min(window.innerWidth * 0.8, 700); // 80% of viewport width, max 700px
    const aspect = divWidth / divHeight;

    const camera = new THREE.PerspectiveCamera(
      50, // Reduced FOV for better text containment
      aspect,
      0.1,
      1000
    );
    camera.position.z = 3; // Moved camera closer

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(divWidth, divHeight); // Set renderer size to match div
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.left = "50%";
    renderer.domElement.style.top = "50%";
    renderer.domElement.style.transform = "translate(-50%, -50%)";
    renderer.domElement.style.zIndex = "2";

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
        const group = new THREE.Group();
        textGroupRef.current = group;

        const maxCharsPerLine = 38;
        const fontSize = 0.1;
        const lineSpacing = 1.4;

        const lines = wrapText(text, maxCharsPerLine);
        // Calculate total height based on number of lines and spacing
        const totalHeight = lines.length * fontSize * lineSpacing;
        maxScrollRef.current = totalHeight;

        console.log("Text Metrics:", {
          lines: lines.length,
          fontSize,
          lineSpacing,
          totalHeight,
          effectiveScrollHeight: totalHeight * 0.8,
        });

        // Calculate the maximum width for left alignment
        let maxWidth = 0;
        const geometries = lines.map((line) => {
          const geometry = new TextGeometry(line, {
            font: font,
            size: fontSize,
            height: 0.02,
            curveSegments: 4,
            bevelEnabled: true,
            bevelThickness: 0.01,
            bevelSize: 0.008,
            bevelSegments: 5,
          } as ExtendedTextGeometryParameters);
          geometry.computeBoundingBox();
          const width =
            geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
          maxWidth = Math.max(maxWidth, width);
          return geometry;
        });

        // Left align position
        const leftAlignX = -maxWidth / 2;

        lines.forEach((line, index) => {
          const textGeometry = geometries[index];
          // Keep the same line positioning (going down from top)
          const lineY = -index * fontSize * lineSpacing;

          const textMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.6,
            roughness: 0.2,
            reflectivity: 1.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            flatShading: true,
            envMapIntensity: 1.5,
          });

          const textMesh = new THREE.Mesh(textGeometry, textMaterial);
          textMesh.position.set(leftAlignX, lineY, 0);
          textMesh.castShadow = true;
          textMesh.receiveShadow = true;
          group.add(textMesh);
        });

        group.position.z = 0;
        group.position.y = 1.0; // Start at initial position

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

        // Reset scroll position when new text is created
        scrollPositionRef.current = 1.0;
      };

      // Set the update function
      setUpdateTextFn(() => updateText);

      // Create initial text mesh
      updateText(currentText);

      // Create environment map for reflections
      const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
      const cubeCamera = new THREE.CubeCamera(0.1, 10, cubeRenderTarget);
      scene.environment = cubeRenderTarget.texture;

      // Lighting adjustments for shimmery appearance
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
      mainLight.position.set(2, 2, 1);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      scene.add(mainLight);

      // Add moving lights for shimmer effect
      const movingLight1 = new THREE.PointLight(0xffffff, 1.0, 10);
      movingLight1.position.set(2, 0, 2);
      scene.add(movingLight1);

      const movingLight2 = new THREE.PointLight(0xffffff, 1.0, 10);
      movingLight2.position.set(-2, 0, 2);
      scene.add(movingLight2);

      // Subtle rim light
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
      rimLight.position.set(0, 0, -1);
      scene.add(rimLight);

      // Animation
      let running = true;
      let time = 0;

      function animate() {
        if (!running) return;

        time += 0.01;

        // Animate moving lights
        if (movingLight1 && movingLight2) {
          movingLight1.position.x = Math.sin(time * 0.5) * 3;
          movingLight1.position.y = Math.cos(time * 0.5) * 2;

          movingLight2.position.x = -Math.sin(time * 0.7) * 3;
          movingLight2.position.y = -Math.cos(time * 0.7) * 2;
        }

        if (currentMesh) {
          // Gentle floating motion
          currentMesh.position.y += Math.sin(time) * 0.0001;

          // Update environment map periodically for dynamic reflections
          if (Math.floor(time * 10) % 30 === 0) {
            currentMesh.visible = false;
            cubeCamera.update(renderer, scene);
            currentMesh.visible = true;
          }
        }

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }
      animate();

      // Update resize handler
      function handleResize() {
        const newDivHeight = window.innerHeight * 0.6;
        const newDivWidth = Math.min(window.innerWidth * 0.8, 700);
        const newAspect = newDivWidth / newDivHeight;

        camera.aspect = newAspect;
        camera.updateProjectionMatrix();
        renderer.setSize(newDivWidth, newDivHeight);
      }
      window.addEventListener("resize", handleResize);

      // Enable clipping in the renderer
      renderer.localClippingEnabled = true;

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
  }, [materials]);

  return null;
}
