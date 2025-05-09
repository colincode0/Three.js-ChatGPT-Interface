"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { motion, AnimatePresence } from "framer-motion";
import { UseChatHelpers } from "ai/react";

// Pre-create reusable vectors and objects to avoid garbage collection
const HALF_PI = Math.PI / 2;
const TEMP_VECTOR2 = new THREE.Vector2();
const TEMP_SPHERICAL = new THREE.Spherical();
const TEMP_VECTOR3 = new THREE.Vector3();

// Cache common values
const MAX_ANGLE_CHANGE = HALF_PI / 2;
const MAX_DISTANCE = 0.8;
const MIN_RADIUS = 1;
const MAX_RADIUS = 2;
const MIN_PHI = Math.PI / 6;
const MAX_PHI = (5 * Math.PI) / 6;
const DRIFT_SPEED = 0.0002;
const MAX_DRIFT_SPEED = 0.0005;
const ANIMATION_SPEED = 0.003;
const RESIZE_DEBOUNCE = 250;
const BLOOM_RESOLUTION = 2;

// Function to generate random position near current position
const getRandomPosition = (
  currentPosition: THREE.Vector3,
  out: THREE.Vector3
): THREE.Vector3 => {
  const angleOffset = (Math.random() * 2 - 1) * MAX_ANGLE_CHANGE;
  const distanceOffset = Math.random() * MAX_DISTANCE;

  TEMP_SPHERICAL.setFromVector3(currentPosition);
  TEMP_SPHERICAL.phi = Math.max(
    MIN_PHI,
    Math.min(MAX_PHI, TEMP_SPHERICAL.phi + angleOffset)
  );
  TEMP_SPHERICAL.theta += (Math.random() * 2 - 1) * MAX_ANGLE_CHANGE;
  TEMP_SPHERICAL.radius = Math.max(
    MIN_RADIUS,
    Math.min(MAX_RADIUS, TEMP_SPHERICAL.radius + distanceOffset)
  );

  return out.setFromSpherical(TEMP_SPHERICAL);
};

// Add this style block near the top of the file, after the imports
const styles = `
  @keyframes dash {
    0% {
      stroke-dashoffset: 0;
    }
    100% {
      stroke-dashoffset: 80;
    }
  }
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #333 #222;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #333;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #222;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  .animate-blink {
    display: inline-block;
    width: 1ch;
    animation: blink 1s steps(1) infinite;
  }
`;

// Utility to split message into words and spaces
const splitWordsAndSpaces = (text: string) => text.split(/(\s+)/);

interface SceneProps {
  chatProps: UseChatHelpers;
}

function Scene({ chatProps }: SceneProps) {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: handleChatSubmit,
    isLoading: isChatLoading,
    setInput,
  } = chatProps;

  // Pre-create reusable vectors and objects to avoid garbage collection
  const startPositionRef = useRef(new THREE.Vector3());
  const targetPositionRef = useRef(new THREE.Vector3(1.5, 0, 0));
  const driftVelocityRef = useRef(new THREE.Vector3());
  const targetDriftVelocityRef = useRef(new THREE.Vector3());
  const idealPosition = useRef(new THREE.Vector3());
  const tempVector = useRef(new THREE.Vector3());
  const isDriftingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [canInput, setCanInput] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [displayedWords, setDisplayedWords] = useState<string[]>([]);
  const [buffer, setBuffer] = useState<string[]>([]);
  const prevMsgId = useRef<string | null>(null);
  const fadeInterval = useRef<NodeJS.Timeout | null>(null);
  const chromaticPassRef = useRef<ShaderPass | null>(null);
  const driftStartTimeRef = useRef(0);

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
  const isTransitioningRef = useRef(false);

  const chatBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat to bottom on new message
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-focus input when canInput becomes true after interaction
  useEffect(() => {
    if (canInput && hasInteracted && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canInput, hasInteracted]);

  useEffect(() => {
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    if (lastMsg && lastMsg.role === "assistant" && isChatLoading) {
      const words = splitWordsAndSpaces(lastMsg.content);
      // If new message, reset
      if (prevMsgId.current !== lastMsg.id) {
        setDisplayedWords([]);
        setBuffer(words);
        prevMsgId.current = lastMsg.id;
      } else {
        // Add new words to buffer
        if (words.length > displayedWords.length + buffer.length) {
          setBuffer(words.slice(displayedWords.length + buffer.length));
        }
      }
    } else {
      setDisplayedWords([]);
      setBuffer([]);
      prevMsgId.current = null;
      if (fadeInterval.current) clearInterval(fadeInterval.current);
    }
  }, [messages, isChatLoading]);

  // Release words from buffer at a steady pace
  useEffect(() => {
    if (buffer.length > 0) {
      if (fadeInterval.current) clearInterval(fadeInterval.current);
      fadeInterval.current = setInterval(() => {
        setDisplayedWords((words) => [...words, buffer[0]]);
        setBuffer((buf) => buf.slice(1));
      }, 20); // Even faster word release
      return () => {
        if (fadeInterval.current) clearInterval(fadeInterval.current);
      };
    } else {
      if (fadeInterval.current) clearInterval(fadeInterval.current);
      return () => {};
    }
  }, [buffer]);

  // Listen for text render complete event
  useEffect(() => {
    const startDrifting = () => {
      console.log("Text render complete, enabling input and starting drift");
      if (cameraRef.current) {
        isDriftingRef.current = true;
        driftStartTimeRef.current = performance.now();

        // Calculate initial drift velocity
        const moveDirection = new THREE.Vector3()
          .subVectors(targetPositionRef.current, startPositionRef.current)
          .normalize();
        const driftSpeed = 0.0002;
        targetDriftVelocityRef.current.copy(
          moveDirection.multiplyScalar(driftSpeed)
        );

        // Enable input as soon as text is rendered
        setCanInput(true);
      }
    };

    window.addEventListener("textRenderComplete", startDrifting);
    return () =>
      window.removeEventListener("textRenderComplete", startDrifting);
  }, []);

  const handleFirstClick = () => {
    if (!hasStarted) {
      if (!cameraRef.current || !controlsRef.current || isAnimatingRef.current)
        return;

      startPositionRef.current.copy(cameraRef.current.position);
      getRandomPosition(cameraRef.current.position, tempVector.current);
      targetPositionRef.current.copy(tempVector.current);

      // For first click, start drifting immediately
      const moveDirection = new THREE.Vector3()
        .subVectors(targetPositionRef.current, startPositionRef.current)
        .normalize();
      const driftSpeed = 0.0002;
      targetDriftVelocityRef.current.copy(
        moveDirection.multiplyScalar(driftSpeed)
      );

      animationProgressRef.current = 0;
      isAnimatingRef.current = true;
      isDriftingRef.current = true; // Start drifting immediately for first click
      driftStartTimeRef.current = performance.now();
      setHasStarted(true);
    }
  };

  const handleFormSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (
        !cameraRef.current ||
        !controlsRef.current ||
        isAnimatingRef.current ||
        isChatLoading
      )
        return;

      try {
        console.log("[Scene] Form submitted, starting sequence");
        setCanInput(false);
        await handleChatSubmit(e);
        setInput(""); // Clear input after submit
        // Reset textarea height
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
          inputRef.current.focus();
        }
        setHasInteracted(true);

        // Handle camera movement
        console.log("[Scene] Starting camera movement");
        startPositionRef.current.copy(cameraRef.current.position);
        getRandomPosition(cameraRef.current.position, tempVector.current);
        targetPositionRef.current.copy(tempVector.current);

        // Reset drift state
        isDriftingRef.current = false;
        driftVelocityRef.current.set(0, 0, 0);

        animationProgressRef.current = 0;
        isAnimatingRef.current = true;
        isTransitioningRef.current = true;

        // Wait for camera movement to complete before enabling text rendering
        const handleCameraMovementComplete = () => {
          console.log("[Scene] Camera movement complete event received");
          window.removeEventListener(
            "cameraMovementComplete",
            handleCameraMovementComplete
          );
        };
        window.addEventListener(
          "cameraMovementComplete",
          handleCameraMovementComplete
        );
      } catch (error) {
        console.error("[Scene] Error submitting form:", error);
        setCanInput(true); // Re-enable input on error
      }
    },
    [handleChatSubmit, isChatLoading, setInput]
  );

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
      100
    );
    camera.position.copy(targetPositionRef.current);
    cameraRef.current = camera;

    // Renderer with optimized settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      precision: "highp",
      stencil: false,
      depth: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing setup with optimized settings
    const composer = new EffectComposer(renderer);
    composerRef.current = composer;

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Optimized bloom pass with reduced resolution
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
      0.5,
      0.8,
      0.85
    );
    bloomPass.threshold = 0.15;
    bloomPass.strength = 1;
    bloomPass.radius = 0.8;
    bloomPass.enabled = true;
    composer.addPass(bloomPass);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x111111, 0.4);
    scene.add(ambientLight);

    // White ambient fill light
    const whiteAmbient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(whiteAmbient);

    // Main light
    const mainLight = new THREE.PointLight(0x00ffff, 15.0); // Cyan light
    mainLight.position.set(8, 4, 8);
    scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.PointLight(0x00ffff, 12.0); // Cyan light
    fillLight.position.set(-6, 2, -6);
    scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.PointLight(0x00ffff, 8.0); // Cyan light
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

    // Optimize model loading
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

        // Optimize model materials
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            // Optimize geometry
            object.geometry.computeBoundingSphere();
            object.geometry.computeBoundingBox();

            // Optimize materials
            if (object.material instanceof THREE.MeshStandardMaterial) {
              object.material.side = THREE.FrontSide;
              object.material.flatShading = true;
              object.material.needsUpdate = true;
              // Optimize material settings
              object.material.roughness = 0.1;
              object.material.metalness = 0.3;
              object.material.envMapIntensity = 2.0;
            }
          }
        });

        scene.add(model);

        // Add outline with optimized settings
        const outlinePass = new OutlinePass(
          new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
          scene,
          camera
        );

        outlinePass.edgeStrength = 3;
        outlinePass.edgeGlow = 0.75;
        outlinePass.edgeThickness = 2.0;
        outlinePass.pulsePeriod = 0;
        outlinePass.visibleEdgeColor.set(0xffffff);
        outlinePass.hiddenEdgeColor.set(0xffffff);

        outlinePass.selectedObjects = [model];
        composer.addPass(outlinePass);

        // Add vignette effect
        const vignettePass = new ShaderPass(VignetteShader);
        vignettePass.uniforms["offset"].value = 0.95;
        vignettePass.uniforms["darkness"].value = 1.6;
        composer.addPass(vignettePass);

        // Add chromatic aberration with cyan separation
        const chromaticAberrationPass = new ShaderPass({
          uniforms: {
            tDiffuse: { value: null },
            rOffset: { value: new THREE.Vector2(-0.005, 0) },
            gOffset: { value: new THREE.Vector2(0.0, 0) },
            bOffset: { value: new THREE.Vector2(0.005, 0) },
            opacity: { value: 0.0 },
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
              
              vec4 chromatic = vec4(
                0.0,
                (cb.g + cb.b) * 0.7,
                cb.b,
                cg.a
              );
              
              gl_FragColor = mix(cg, chromatic, opacity * 0.3);
            }
          `,
        });
        composer.addPass(chromaticAberrationPass);
        chromaticPassRef.current = chromaticAberrationPass;

        setIsModelLoaded(true);
        setIsLoading(false);
      },
      undefined,
      (error) => {
        console.error("Error loading model:", error);
        setIsLoading(false);
      }
    );

    // Animation
    let running = true;

    const animate = (currentTime: number) => {
      if (!running) return;

      if (isAnimatingRef.current && cameraRef.current) {
        animationProgressRef.current += ANIMATION_SPEED;

        if (animationProgressRef.current >= 1) {
          isAnimatingRef.current = false;
          animationProgressRef.current = 1;
          // Ensure camera is exactly at target position
          cameraRef.current.position.copy(targetPositionRef.current);
          // Always dispatch camera movement complete when animation is done
          console.log(
            "[Scene] Camera movement truly complete, dispatching event"
          );
          window.dispatchEvent(new CustomEvent("cameraMovementComplete"));
        }

        const t = animationProgressRef.current;
        const easedProgress =
          t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

        let chromaticOpacity = 0;
        if (t < 0.5) {
          chromaticOpacity = (t / 0.5) * (t / 0.5);
        } else if (t < 0.7) {
          chromaticOpacity = 1.0;
        } else {
          const fadeOutProgress = (t - 0.7) / 0.3;
          chromaticOpacity =
            1.0 - fadeOutProgress * fadeOutProgress * fadeOutProgress;
        }

        if (chromaticPassRef.current?.uniforms?.opacity) {
          chromaticPassRef.current.uniforms.opacity.value = chromaticOpacity;
        }

        cameraRef.current.position.lerpVectors(
          startPositionRef.current,
          targetPositionRef.current,
          easedProgress
        );
      } else if (isDriftingRef.current && cameraRef.current) {
        const driftTime = (currentTime - driftStartTimeRef.current) / 1000;
        const driftProgress = Math.min(driftTime / 1.0, 1);
        const easeInDrift = driftProgress * driftProgress * driftProgress;

        targetDriftVelocityRef.current.clampLength(0, MAX_DRIFT_SPEED);

        const previousPosition = cameraRef.current.position.clone();

        if (driftTime > 10) {
          driftVelocityRef.current.lerp(new THREE.Vector3(0, 0, 0), 0.01);
        } else {
          driftVelocityRef.current.lerp(
            targetDriftVelocityRef.current,
            easeInDrift * 0.1
          );
        }

        cameraRef.current.position.add(driftVelocityRef.current);

        const distanceFromCenter = cameraRef.current.position.length();
        if (distanceFromCenter > 2.5 || distanceFromCenter < 0.5) {
          idealPosition.current
            .copy(cameraRef.current.position)
            .normalize()
            .multiplyScalar(1.5);

          const correctionStrength = distanceFromCenter > 2.5 ? 0.05 : 0.02;
          cameraRef.current.position.lerp(
            idealPosition.current,
            correctionStrength
          );

          const newDirection = idealPosition.current
            .sub(previousPosition)
            .normalize();

          const currentSpeed = driftVelocityRef.current.length();
          driftVelocityRef.current.copy(
            newDirection.multiplyScalar(currentSpeed * 0.8)
          );

          targetDriftVelocityRef.current.copy(
            newDirection.multiplyScalar(MAX_DRIFT_SPEED)
          );
        }
      }

      if (controlsRef.current) {
        controlsRef.current.update();
      }
      composerRef.current?.render();

      requestAnimationFrame(animate);
    };

    // Start animation loop
    running = true;
    animate(0);

    // Optimized resize handler with debounce
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        if (!camera || !renderer || !composer) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        TEMP_VECTOR2.set(width / BLOOM_RESOLUTION, height / BLOOM_RESOLUTION);

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        composer.setSize(width, height);
      }, RESIZE_DEBOUNCE);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      running = false;
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
    <>
      <style>{styles}</style>
      <div className="fixed inset-0 w-full h-full">
        <motion.div
          ref={containerRef}
          className="absolute inset-0 w-full h-full overflow-hidden bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: isModelLoaded ? 1 : 0 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-10"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-8 h-8 relative"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="text-white/20"
                  />
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="80"
                    className="text-white/70 animate-[dash_2s_linear_infinite]"
                  />
                </svg>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
                className="bg-black/50 text-white/70 px-4 py-2 rounded-lg border border-white/20"
              >
                Loading 3D object
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!isLoading && (
            <motion.form
              onSubmit={handleFormSubmit}
              className="fixed bottom-8 left-0 right-0 flex flex-col items-center z-10 w-full px-2 sm:px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
            >
              <motion.div
                className="relative w-full max-w-[98vw] sm:max-w-[700px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              >
                <div className="relative w-full">
                  <textarea
                    value={input}
                    onChange={handleInputChange}
                    onClick={handleFirstClick}
                    ref={inputRef}
                    className="bg-black/80 text-white px-4 py-3 rounded-lg border border-white/20 focus:outline-none focus:border-white/40 w-full pr-10 resize-none overflow-y-auto h-[83px] max-h-[83px] leading-normal text-base sm:text-lg align-top"
                    rows={2}
                    disabled={isChatLoading || !canInput}
                    placeholder={
                      !canInput && hasInteracted
                        ? "Responding..."
                        : "Type something..."
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const form = e.currentTarget.form;
                        if (form) {
                          handleFormSubmit(
                            new Event(
                              "submit"
                            ) as unknown as React.FormEvent<HTMLFormElement>
                          );
                        }
                      }
                    }}
                    onInput={(e) => {
                      const target = e.currentTarget;
                      target.scrollTop = target.scrollHeight;
                    }}
                  />
                </div>
                <motion.button
                  type="submit"
                  className="absolute right-2 top-2 text-white/70 hover:text-white transition-colors"
                  aria-label="Submit"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={isChatLoading}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </motion.button>
              </motion.div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export default Scene;
