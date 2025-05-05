import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  TextGeometry,
  TextGeometryParameters,
} from "three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

interface ExtendedTextGeometryParameters extends TextGeometryParameters {
  height: number;
}

interface OverlayCubeProps {
  messages: { role: string; content: string }[];
  isChatLoading: boolean;
  shouldFadeOut: boolean;
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
    // Add extra padding to account for character width variations
    const effectiveLength = wordLength + Math.ceil(wordLength * 0.1);

    if (currentLineLength + effectiveLength + 1 <= maxCharsPerLine) {
      if (currentLine) {
        currentLine += " " + word;
        currentLineLength += effectiveLength + 1;
      } else {
        currentLine = word;
        currentLineLength = effectiveLength;
      }
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      currentLineLength = effectiveLength;
    }
  }
  if (currentLine) lines.push(currentLine);

  console.log("Wrapped lines:", lines);
  console.log("Number of lines:", lines.length);
  return lines;
}

export default function OverlayCube({
  messages,
  isChatLoading,
  shouldFadeOut,
}: OverlayCubeProps) {
  const [currentText, setCurrentText] = useState("");
  const [updateTextFn, setUpdateTextFn] = useState<
    ((text: string) => void) | null
  >(null);
  const textGroupRef = useRef<THREE.Group | null>(null);
  const scrollPositionRef = useRef(0);
  const maxScrollRef = useRef(0);
  const currentMeshRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationsRef = useRef<((time: number) => boolean)[]>([]);
  const cubeSceneRef = useRef<THREE.Scene | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Reset loading state when loading starts
  useEffect(() => {
    if (isChatLoading) {
      // Reset any necessary state here
    }
  }, [isChatLoading]);

  // Clear animations when component unmounts
  useEffect(() => {
    return () => {
      animationsRef.current = [];
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update text when messages change and loading is complete
  useEffect(() => {
    if (messages.length > 0 && !isChatLoading) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant") {
        setCurrentText(lastMessage.content);
        scrollPositionRef.current = 0.5;
        if (textGroupRef.current) {
          textGroupRef.current.position.y = 0.5;
        }
      }
    } else if (isChatLoading && currentMeshRef.current && sceneRef.current) {
      const meshToFadeOut = currentMeshRef.current;
      const startTime = performance.now();
      const duration = 400;

      const fadeOut = () => {
        const currentTime = performance.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        meshToFadeOut.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const material = child.material as THREE.MeshPhysicalMaterial;
            if (material.opacity !== undefined) {
              material.opacity = 1 - progress;
            }
          }
        });

        if (progress < 1) {
          requestAnimationFrame(fadeOut);
        } else {
          sceneRef.current?.remove(meshToFadeOut);
          meshToFadeOut.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          });
          currentMeshRef.current = null;
        }
      };

      fadeOut();
    }
  }, [messages, isChatLoading]);

  // Handle fade out when shouldFadeOut changes
  useEffect(() => {
    if (shouldFadeOut && currentMeshRef.current && sceneRef.current) {
      const meshToFadeOut = currentMeshRef.current;
      const startTime = performance.now();
      const duration = 400;

      const fadeOut = () => {
        const currentTime = performance.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        meshToFadeOut.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const material = child.material as THREE.MeshPhysicalMaterial;
            if (material.opacity !== undefined) {
              material.opacity = 1 - progress;
            }
          }
        });

        if (progress < 1) {
          requestAnimationFrame(fadeOut);
        } else {
          sceneRef.current?.remove(meshToFadeOut);
          meshToFadeOut.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          });
          currentMeshRef.current = null;
        }
      };

      fadeOut();
    }
  }, [shouldFadeOut]);

  // Update scroll handler
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (textGroupRef.current) {
        const scrollSpeed = 0.002;
        const delta = event.deltaY * scrollSpeed;
        const currentPos = textGroupRef.current.position.y;

        const bottomY = 1.0;
        const baseMultiplier = 0.3;
        const heightThreshold = 2.0;
        let adaptiveMultiplier;

        if (maxScrollRef.current <= heightThreshold) {
          adaptiveMultiplier = baseMultiplier;
        } else {
          const extraHeight = maxScrollRef.current - heightThreshold;
          adaptiveMultiplier = baseMultiplier + extraHeight * 0.15;
        }

        const topY = bottomY + maxScrollRef.current * adaptiveMultiplier;
        let newPosition = currentPos + delta;
        newPosition = Math.max(bottomY, Math.min(topY, newPosition));

        textGroupRef.current.position.y = newPosition;
        scrollPositionRef.current = newPosition;
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

  // Initialize scenes and renderer
  useEffect(() => {
    let container = document.getElementById("overlay-cube-canvas");
    if (!container) {
      container = document.createElement("div");
      container.id = "overlay-cube-canvas";
      container.style.position = "absolute";
      container.style.inset = "0";
      container.style.pointerEvents = "none";
      container.style.zIndex = "50";

      const backgroundDiv = document.createElement("div");
      backgroundDiv.style.position = "absolute";
      backgroundDiv.style.left = "50%";
      backgroundDiv.style.top = "50%";
      backgroundDiv.style.transform = "translate(-50%, -50%)";
      backgroundDiv.style.width = "80%";
      backgroundDiv.style.maxWidth = "700px";
      backgroundDiv.style.height = "60%";
      backgroundDiv.style.backgroundColor = "rgb(0, 0, 0)";
      backgroundDiv.style.border = "1px solid rgba(255, 255, 255, 0.2)";
      backgroundDiv.style.borderRadius = "0.5rem";
      backgroundDiv.style.zIndex = "1";

      container.appendChild(backgroundDiv);
      document.body.appendChild(container);
    }

    // Main scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Cube scene setup
    const cubeScene = new THREE.Scene();
    cubeSceneRef.current = cubeScene;

    const divHeight = window.innerHeight * 0.6;
    const divWidth = Math.min(window.innerWidth * 0.8, 700);
    const aspect = divWidth / divHeight;

    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.z = 3;

    const cubeCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    cubeCamera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(divWidth, divHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.left = "50%";
    renderer.domElement.style.top = "50%";
    renderer.domElement.style.transform = "translate(-50%, -50%)";
    renderer.domElement.style.zIndex = "2";
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // Setup cube
    const cubeGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const cubeMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      shininess: 100,
      specular: 0x444444,
      transparent: true,
      opacity: 0.8,
    });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(0, 0.2, 0);
    cubeScene.add(cube);
    cubeRef.current = cube;

    // Add lights for the cube
    const cubeAmbientLight = new THREE.AmbientLight(0x404040);
    const cubePointLight = new THREE.PointLight(0x00ffff, 1);
    cubePointLight.position.set(2, 2, 2);
    cubeScene.add(cubeAmbientLight);
    cubeScene.add(cubePointLight);

    // Create environment map for reflections
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
    const envCamera = new THREE.CubeCamera(0.1, 10, cubeRenderTarget);
    scene.environment = cubeRenderTarget.texture;

    let time = 0;
    function animate(currentTime: number) {
      time += 0.01;

      // Animate the cube
      if (cubeRef.current) {
        cubeRef.current.rotation.x = time * 0.5;
        cubeRef.current.rotation.y = time * 0.3;
      }

      // Process text animations if any
      animationsRef.current = animationsRef.current.filter((anim) =>
        anim(currentTime)
      );

      // Update environment map periodically
      if (Math.floor(time * 10) % 30 === 0) {
        envCamera.update(renderer, scene);
      }

      // Render both scenes
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(scene, camera);
      renderer.render(cubeScene, cubeCamera);

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    // Start animation loop
    animate(performance.now());

    // Update resize handler
    function handleResize() {
      const newDivHeight = window.innerHeight * 0.6;
      const newDivWidth = Math.min(window.innerWidth * 0.8, 700);
      const newAspect = newDivWidth / newDivHeight;

      camera.aspect = newAspect;
      camera.updateProjectionMatrix();
      cubeCamera.aspect = newAspect;
      cubeCamera.updateProjectionMatrix();
      renderer.setSize(newDivWidth, newDivHeight);
    }
    window.addEventListener("resize", handleResize);

    // Enable clipping in the renderer
    renderer.localClippingEnabled = true;

    const fontLoader = new FontLoader();
    fontLoader.load("/fonts/helvetiker_regular.typeface.json", (font) => {
      let currentMesh: THREE.Group | null = null;

      // Text configuration constants
      const maxCharsPerLine = 55;
      const fontSize = 0.085;
      const lineSpacing = 1.6;
      const leftMargin = -1.3;

      // Create update function
      const updateText = (text: string) => {
        // Remove old mesh immediately
        if (currentMesh) {
          scene.remove(currentMesh);
          currentMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material instanceof THREE.Material) {
                child.material.dispose();
              }
            }
          });
        }

        const group = new THREE.Group();
        textGroupRef.current = group;
        scene.add(group);

        const lines = wrapText(text, maxCharsPerLine);
        const totalHeight = lines.length * fontSize * lineSpacing;
        maxScrollRef.current = totalHeight;

        // Create shared material for all text
        const sharedMaterial = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0.6,
          roughness: 0.2,
          reflectivity: 1.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
          flatShading: true,
          envMapIntensity: 1.5,
          transparent: true,
          opacity: 0,
          alphaTest: 0,
          depthWrite: false,
          blending: THREE.NormalBlending,
        });

        // Create meshes array to track loading
        const meshPromises = lines.map((line, i) => {
          return new Promise<void>((resolve) => {
            const geometry = new TextGeometry(line, {
              font: font,
              size: fontSize,
              height: 0.012,
              curveSegments: 3,
              bevelEnabled: true,
              bevelThickness: 0.004,
              bevelSize: 0.003,
              bevelSegments: 2,
            } as ExtendedTextGeometryParameters);

            const textMesh = new THREE.Mesh(geometry, sharedMaterial.clone());
            textMesh.material.opacity = 0;
            const lineY = -i * fontSize * lineSpacing;
            textMesh.position.set(leftMargin, lineY, 0);
            textMesh.castShadow = true;
            textMesh.receiveShadow = true;
            group.add(textMesh);

            setTimeout(resolve, 0);
          });
        });

        // Wait for all meshes to be created and added
        Promise.all(meshPromises).then(() => {
          currentMesh = group;
          currentMeshRef.current = group;
          group.position.set(0, 1.0, 0);
          scrollPositionRef.current = 1.0;
          scene.add(group);

          // Start fade animation after everything is loaded
          const startTime = performance.now();
          const fadeInDuration = 700;
          const fadeProgress = { value: 0 };

          const updateFade = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            fadeProgress.value = Math.min(elapsed / fadeInDuration, 1);

            group.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                const material = child.material as THREE.MeshPhysicalMaterial;
                material.opacity = fadeProgress.value;
                material.needsUpdate = true;
              }
            });

            if (fadeProgress.value >= 1) {
              window.dispatchEvent(new CustomEvent("textRenderComplete"));
            }
            return fadeProgress.value < 1;
          };

          animationsRef.current.push(updateFade);
        });
      };

      // Set the update function
      setUpdateTextFn(() => updateText);

      // Create initial text mesh
      if (currentText) {
        updateText(currentText);
      }

      // Add original lighting for text
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 3);
      mainLight.position.set(2, 2, 1);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      scene.add(mainLight);

      // Add moving lights for shimmer effect
      const movingLight1 = new THREE.PointLight(0xffffff, 1.2, 10);
      movingLight1.position.set(2, 0, 2);
      scene.add(movingLight1);

      const movingLight2 = new THREE.PointLight(0xffffff, 1.2, 10);
      movingLight2.position.set(-2, 0, 2);
      scene.add(movingLight2);

      // Subtle rim light
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
      rimLight.position.set(0, 0, -1);
      scene.add(rimLight);
    });

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (currentMeshRef.current) {
        currentMeshRef.current.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
      }
      if (container && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // Empty dependency array - only run once on mount

  return null;
}
