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
  messages: { role: string; content: string; id: string }[];
  isChatLoading: boolean;
}

function cleanText(text: string): string {
  // Only remove literal \n and trim whitespace
  const cleanedText = text
    .replace(/\\n/g, " ") // Replace literal \n with space
    .trim();

  console.log("Cleaned text:", cleanedText);
  return cleanedText;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  // Clean the text first
  const cleanedText = cleanText(text);
  console.log("Wrapping text:", cleanedText);
  console.log("Max chars per line:", maxCharsPerLine);

  // Split by actual newlines first to preserve paragraph structure
  const paragraphs = cleanedText.split(/\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      // Preserve empty lines
      lines.push("");
      continue;
    }

    const words = paragraph.split(" ").filter((word) => word.length > 0);
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
  }

  console.log("Wrapped lines:", lines);
  console.log("Number of lines:", lines.length);
  return lines;
}

export default function OverlayCube({
  messages,
  isChatLoading,
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
  const pendingTextRef = useRef<string | null>(null);
  const cubeOpacityRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const movingLight1Ref = useRef<THREE.PointLight | null>(null);
  const movingLight2Ref = useRef<THREE.PointLight | null>(null);

  // Handle loading state changes
  useEffect(() => {
    console.log("Loading state changed:", isChatLoading);
    if (isChatLoading) {
      console.log("Loading started");
      // When loading starts, fade out current text and show cube
      if (
        currentMeshRef.current &&
        sceneRef.current &&
        !isTransitioningRef.current
      ) {
        console.log("Fading out existing text");
        isTransitioningRef.current = true;
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
            console.log("Text fade out complete");
            sceneRef.current?.remove(meshToFadeOut);
            meshToFadeOut.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                (child.material as THREE.Material).dispose();
              }
            });
            currentMeshRef.current = null;
            isTransitioningRef.current = false;

            // Fade in cube after text is gone
            if (cubeRef.current) {
              console.log("Fading in cube");
              const startTime = performance.now();
              const duration = 400;

              const fadeInCube = () => {
                const currentTime = performance.now();
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                const material = cubeRef.current!
                  .material as THREE.MeshPhongMaterial;
                material.opacity = progress;
                cubeOpacityRef.current = progress;

                if (progress < 1) {
                  requestAnimationFrame(fadeInCube);
                } else {
                  console.log("Cube fade in complete");
                }
              };

              fadeInCube();
            }
          }
        };

        fadeOut();
      } else if (cubeRef.current) {
        // If no text to fade out, just show cube
        console.log("No text to fade out, showing cube");
        const material = cubeRef.current.material as THREE.MeshPhongMaterial;
        material.opacity = 1;
        cubeOpacityRef.current = 1;
      }
    } else if (pendingTextRef.current && !isTransitioningRef.current) {
      // When loading completes, check if we have pending text
      console.log("Loading complete, checking for pending text");
      if (cubeRef.current) {
        console.log("Fading out cube");
        isTransitioningRef.current = true;
        const startTime = performance.now();
        const duration = 400;

        const fadeOutCube = () => {
          const currentTime = performance.now();
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          const material = cubeRef.current!.material as THREE.MeshPhongMaterial;
          material.opacity = 1 - progress;
          cubeOpacityRef.current = 1 - progress;

          if (progress < 1) {
            requestAnimationFrame(fadeOutCube);
          } else {
            console.log("Cube fade out complete, rendering new text");
            setCurrentText(pendingTextRef.current!);
            pendingTextRef.current = null;
            isTransitioningRef.current = false;
          }
        };

        fadeOutCube();
      }
    }
  }, [isChatLoading]);

  // Handle new messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      console.log("Message received:", {
        role: lastMessage.role,
        isChatLoading,
      });

      // Store the message when it's from assistant, regardless of loading state
      if (lastMessage.role === "assistant") {
        // Only store new messages
        if (lastMessage.id !== lastMessageIdRef.current) {
          console.log("New message received, storing for later");
          lastMessageIdRef.current = lastMessage.id;
          pendingTextRef.current = lastMessage.content;
        } else if (lastMessage.id === lastMessageIdRef.current) {
          // Update the pending text with the latest content
          console.log("Updating pending text with latest content");
          pendingTextRef.current = lastMessage.content;
        }
      }
    }
  }, [messages, isChatLoading]);

  // Listen for camera movement completion
  useEffect(() => {
    const handleCameraMovementComplete = () => {
      console.log(
        "Camera movement complete, pending text:",
        !!pendingTextRef.current
      );
      // Only handle camera movement if we're still loading
      if (isChatLoading) {
        console.log("Still loading, waiting for completion");
        return;
      }

      if (
        pendingTextRef.current &&
        updateTextFn &&
        !isTransitioningRef.current
      ) {
        console.log("Found pending text, fading out cube");
        isTransitioningRef.current = true;
        const startTime = performance.now();
        const duration = 400;

        const fadeOutCube = () => {
          const currentTime = performance.now();
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          if (cubeRef.current) {
            const material = cubeRef.current
              .material as THREE.MeshPhongMaterial;
            material.opacity = 1 - progress;
            cubeOpacityRef.current = 1 - progress;
          }

          if (progress < 1) {
            requestAnimationFrame(fadeOutCube);
          } else {
            console.log("Cube fade out complete, rendering new text");
            setCurrentText(pendingTextRef.current!);
            pendingTextRef.current = null;
            isTransitioningRef.current = false;
          }
        };

        fadeOutCube();
      } else {
        console.log("No pending text or already transitioning");
      }
    };

    window.addEventListener(
      "cameraMovementComplete",
      handleCameraMovementComplete
    );
    return () =>
      window.removeEventListener(
        "cameraMovementComplete",
        handleCameraMovementComplete
      );
  }, [updateTextFn, isChatLoading]);

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
    if (updateTextFn && currentText) {
      console.log("Updating 3D text");
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
      opacity: 0, // Start invisible
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

      // Animate moving lights
      if (movingLight1Ref.current && movingLight2Ref.current) {
        movingLight1Ref.current.position.x = Math.sin(time * 0.5) * 2;
        movingLight1Ref.current.position.z = Math.cos(time * 0.5) * 2;
        movingLight2Ref.current.position.x = Math.sin(time * 0.5 + Math.PI) * 2;
        movingLight2Ref.current.position.z = Math.cos(time * 0.5 + Math.PI) * 2;
      }

      // Animate text group if it exists
      if (textGroupRef.current) {
        // Subtle z-axis movement
        textGroupRef.current.position.z = Math.sin(time * 0.3) * 0.05;
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
      // Only render cube scene if cube is visible
      if (cubeOpacityRef.current > 0) {
        renderer.render(cubeScene, cubeCamera);
      }

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
        console.log("Starting text update");
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
          metalness: 0.8,
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
          console.log("All text meshes created, starting fade in");
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
              console.log("Text fade in complete");
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
      movingLight1Ref.current = movingLight1;

      const movingLight2 = new THREE.PointLight(0xffffff, 1.2, 10);
      movingLight2.position.set(-2, 0, 2);
      scene.add(movingLight2);
      movingLight2Ref.current = movingLight2;

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
