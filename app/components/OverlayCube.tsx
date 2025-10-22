import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Message } from "ai";

type SequenceState =
  | "idle" // Initial state, ready for input
  | "loading" // Camera moving and/or LLM streaming, cube visible
  | "text_rendering" // Text is being rendered, cube fading out
  | "complete"; // Text is rendered, camera drift active

interface OverlayCubeProps {
  messages: Message[];
  sequenceState: SequenceState;
  lastCompleteContent: string | null;
}

function cleanText(text: string): string {
  // Convert literal \n to actual line breaks and trim whitespace
  const cleanedText = text
    .replace(/\\n/g, "\n") // Replace literal \n with actual line breaks
    .trim();

  console.log("Cleaned text:", cleanedText);
  return cleanedText;
}

// Cache common values
const FADE_DURATION = 400;
const ANIMATION_SPEED = 0.01;
const CUBE_ROTATION_SPEED = { x: 0.5, y: 0.3 };
const MORPH_DURATION = 800; // Duration for morphing transition
const SHAPE_PAUSE_DURATION = 810; // 0.81 second pause at each shape

export default function OverlayCube({
  messages,
  sequenceState,
  lastCompleteContent,
}: OverlayCubeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [displayedText, setDisplayedText] = useState<string>("");
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTextRef = useRef<HTMLDivElement | null>(null);
  const textContentRef = useRef<HTMLDivElement | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);
  const cubeOpacityRef = useRef(0);

  const fadeOutText = useCallback(() => {
    if (!textContentRef.current) return;

    console.log("[OverlayCube] Starting text fade out", {
      timestamp: new Date().toISOString(),
    });

    const textElement = textContentRef.current;
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / FADE_DURATION, 1);

      // Smooth easing
      const easedProgress =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Update opacity
      textElement.style.opacity = String(1 - easedProgress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log("[OverlayCube] Text fade out complete", {
          timestamp: new Date().toISOString(),
        });
        setDisplayedText("");
      }
    };

    animate();
  }, []);

  const fadeOutCube = useCallback(() => {
    if (!cubeRef.current) return;
    if (loadingTextRef.current) {
      // Animate loading text fade out
      const startTime = performance.now();
      const duration = 400;
      const animateText = () => {
        const currentTime = performance.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Smooth easing
        const easedProgress =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        loadingTextRef.current!.style.opacity = String(
          0.8 * (1 - easedProgress)
        );
        if (progress < 1) {
          requestAnimationFrame(animateText);
        }
      };
      animateText();
    }

    console.log("[OverlayCube] Starting cube fade out", {
      timestamp: new Date().toISOString(),
    });

    const startTime = performance.now();
    const duration = 400;

    const animate = () => {
      const currentTime = performance.now();
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing
      const easedProgress =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      if (cubeRef.current) {
        const material = cubeRef.current.material as THREE.MeshPhongMaterial;
        material.opacity = 1 - easedProgress;
        cubeOpacityRef.current = 1 - easedProgress;
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log("[OverlayCube] Cube fade out complete", {
          timestamp: new Date().toISOString(),
        });

        // Start text render after cube is fully faded out
        if (lastCompleteContent) {
          console.log("[OverlayCube] Starting text render after cube fade");
          setDisplayedText(cleanText(lastCompleteContent));
        }
      }
    };

    animate();
  }, [lastCompleteContent]);

  // Handle state changes
  useEffect(() => {
    console.log("[OverlayCube] State Change:", {
      sequenceState,
      hasCompleteContent: !!lastCompleteContent,
      contentLength: lastCompleteContent?.length,
      isVisible,
      isFading,
      hasDisplayedText: !!displayedText,
      cubeOpacity: cubeOpacityRef.current,
      timestamp: new Date().toISOString(),
    });

    // Clear any existing fade timeout
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }

    if (sequenceState === "loading") {
      console.log("[OverlayCube] Loading state - handling transition");
      setIsVisible(true);
      setIsFading(false);

      // Always fade out text first if it exists
      if (displayedText) {
        console.log(
          "[OverlayCube] Fading out existing text before showing cube"
        );
        fadeOutText();

        // Show cube after text fade out
        fadeTimeoutRef.current = setTimeout(() => {
          if (cubeRef.current) {
            console.log("[OverlayCube] Showing cube after text fade");
            const material = cubeRef.current
              .material as THREE.MeshPhongMaterial;
            material.opacity = 1;
            cubeOpacityRef.current = 1;
            if (loadingTextRef.current) {
              // Animate loading text fade in
              const startTime = performance.now();
              const duration = FADE_DURATION;
              const animateText = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Smooth easing
                const easedProgress =
                  progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                loadingTextRef.current!.style.opacity = String(
                  0.8 * easedProgress
                );
                if (progress < 1) {
                  requestAnimationFrame(animateText);
                }
              };
              animateText();
            }
          }
        }, FADE_DURATION);
      } else {
        // Show cube immediately if no text to fade out
        if (cubeRef.current) {
          console.log(
            "[OverlayCube] Showing cube immediately (no text to fade)"
          );
          const material = cubeRef.current.material as THREE.MeshPhongMaterial;
          material.opacity = 1;
          cubeOpacityRef.current = 1;
          if (loadingTextRef.current) {
            // Animate loading text fade in
            const startTime = performance.now();
            const duration = FADE_DURATION;
            const animateText = () => {
              const elapsed = performance.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // Smooth easing
              const easedProgress =
                progress < 0.5
                  ? 4 * progress * progress * progress
                  : 1 - Math.pow(-2 * progress + 2, 3) / 2;
              loadingTextRef.current!.style.opacity = String(
                0.8 * easedProgress
              );
              if (progress < 1) {
                requestAnimationFrame(animateText);
              }
            };
            animateText();
          }
        }
      }
    } else if (sequenceState === "text_rendering") {
      console.log("[OverlayCube] Text rendering state:", {
        hasCompleteContent: !!lastCompleteContent,
        contentLength: lastCompleteContent?.length,
        hasDisplayedText: !!displayedText,
      });

      // Start fading out cube when text rendering begins
      if (cubeRef.current) {
        console.log("[OverlayCube] Starting cube fade out for text rendering");
        fadeOutCube();
        setIsFading(true);
        if (loadingTextRef.current) {
          // Animate loading text fade out (in case not already handled)
          const startTime = performance.now();
          const duration = FADE_DURATION;
          const animateText = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Smooth easing
            const easedProgress =
              progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            loadingTextRef.current!.style.opacity = String(
              0.8 * (1 - easedProgress)
            );
            if (progress < 1) {
              requestAnimationFrame(animateText);
            }
          };
          animateText();
        }
      }

      // Keep text visible during text_rendering state
      setIsVisible(true);
    } else if (sequenceState === "complete") {
      console.log("[OverlayCube] Complete state:", {
        hasCompleteContent: !!lastCompleteContent,
        contentLength: lastCompleteContent?.length,
        hasDisplayedText: !!displayedText,
      });

      // Ensure cube is faded out in complete state
      if (cubeRef.current && cubeOpacityRef.current > 0) {
        console.log(
          "[OverlayCube] Ensuring cube is faded out in complete state"
        );
        fadeOutCube();
        setIsFading(true);
        if (loadingTextRef.current) {
          // Animate loading text fade out (in case not already handled)
          const startTime = performance.now();
          const duration = FADE_DURATION;
          const animateText = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Smooth easing
            const easedProgress =
              progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            loadingTextRef.current!.style.opacity = String(
              0.8 * (1 - easedProgress)
            );
            if (progress < 1) {
              requestAnimationFrame(animateText);
            }
          };
          animateText();
        }
      }

      // Keep text visible
      setIsVisible(true);
    } else {
      // idle state
      console.log("[OverlayCube] Idle state - hiding everything");
      setIsVisible(false);
      setIsFading(false);
      setDisplayedText("");
      if (loadingTextRef.current) {
        loadingTextRef.current.style.opacity = "0";
      }
    }
  }, [
    sequenceState,
    lastCompleteContent,
    displayedText,
    fadeOutText,
    fadeOutCube,
    isVisible,
    isFading,
  ]);

  // Handle camera movement completion
  useEffect(() => {
    const handleCameraMovementComplete = () => {
      console.log("[OverlayCube] Camera Movement Complete:", {
        hasCompleteContent: !!lastCompleteContent,
        sequenceState,
        timestamp: new Date().toISOString(),
      });

      // If we have complete content, start text render regardless of state
      if (lastCompleteContent) {
        console.log("[OverlayCube] Starting text render with content:", {
          contentLength: lastCompleteContent.length,
          timestamp: new Date().toISOString(),
        });

        // Set the text content
        setDisplayedText(cleanText(lastCompleteContent));
      } else {
        console.log("[OverlayCube] Not starting text render:", {
          sequenceState,
          hasCompleteContent: !!lastCompleteContent,
        });
      }
    };

    window.addEventListener(
      "cameraMovementComplete",
      handleCameraMovementComplete
    );
    return () => {
      window.removeEventListener(
        "cameraMovementComplete",
        handleCameraMovementComplete
      );
    };
  }, [sequenceState, lastCompleteContent]);

  // Handle message updates
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      console.log("[OverlayCube] Message Update:", {
        role: lastMessage.role,
        sequenceState,
        messageId: lastMessage.id,
        hasContent: !!lastMessage.content,
        contentLength: lastMessage.content.length,
        timestamp: new Date().toISOString(),
      });

      // Only store the message when it's from assistant and loading is complete
      if (lastMessage.role === "assistant" && sequenceState === "complete") {
        console.log("[OverlayCube] Storing new message");
        setDisplayedText(cleanText(lastMessage.content));
      }
    }
  }, [messages, sequenceState]);

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

      // Add loading text INSIDE the black container
      const loadingText = document.createElement("div");
      loadingText.textContent = "loading 3d LLM output";
      loadingText.style.position = "absolute";
      loadingText.style.left = "50%";
      loadingText.style.top = "60%"; // 60% from the top of the black container
      loadingText.style.transform = "translate(-50%, 0)";
      loadingText.style.color = "white";
      loadingText.style.fontSize = "1rem";
      loadingText.style.fontFamily = "system-ui, -apple-system, sans-serif";
      loadingText.style.opacity = "0"; // Start invisible
      loadingText.style.zIndex = "3";
      loadingText.style.textTransform = "lowercase";
      loadingText.style.letterSpacing = "0.05em";
      backgroundDiv.appendChild(loadingText);
      loadingTextRef.current = loadingText;

      // Add text content area
      const textContent = document.createElement("div");
      textContent.style.position = "absolute";
      textContent.style.left = "50%";
      textContent.style.top = "50%";
      textContent.style.transform = "translate(-50%, -50%)";
      textContent.style.width = "90%";
      textContent.style.height = "80%";
      textContent.style.color = "white";
      textContent.style.fontSize = "0.9rem";
      textContent.style.fontFamily = "system-ui, -apple-system, sans-serif";
      textContent.style.lineHeight = "1.6";
      textContent.style.overflowY = "auto";
      textContent.style.overflowX = "hidden";
      textContent.style.padding = "1rem";
      textContent.style.opacity = "0";
      textContent.style.zIndex = "10"; // Higher z-index to ensure it's above other elements
      textContent.style.whiteSpace = "pre-wrap";
      textContent.style.wordWrap = "break-word";
      textContent.style.boxSizing = "border-box";
      textContent.style.pointerEvents = "auto"; // Enable pointer events for scrolling

      // Add custom scrollbar styling
      textContent.style.scrollbarWidth = "thin";
      textContent.style.scrollbarColor = "#333 #222";

      // Webkit scrollbar styling with smooth scrolling
      const scrollbarStyle = document.createElement("style");
      scrollbarStyle.textContent = `
        #overlay-cube-canvas .text-content {
          scroll-behavior: smooth;
        }
        #overlay-cube-canvas .text-content::-webkit-scrollbar {
          width: 8px;
        }
        #overlay-cube-canvas .text-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        #overlay-cube-canvas .text-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }
        #overlay-cube-canvas .text-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        #overlay-cube-canvas .scroll-indicator {
          position: absolute;
          bottom: 10px;
          right: 10px;
          width: 20px;
          height: 20px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
          z-index: 4;
        }
        #overlay-cube-canvas .scroll-indicator.visible {
          opacity: 1;
        }
        #overlay-cube-canvas .scroll-indicator::after {
          content: "↓";
          color: white;
          font-size: 12px;
          font-weight: bold;
        }
      `;
      document.head.appendChild(scrollbarStyle);

      textContent.className = "text-content";
      backgroundDiv.appendChild(textContent);
      textContentRef.current = textContent;

      // Add scroll indicator
      const scrollIndicator = document.createElement("div");
      scrollIndicator.className = "scroll-indicator";
      backgroundDiv.appendChild(scrollIndicator);

      container.appendChild(backgroundDiv);
      document.body.appendChild(container);
    }

    // Main scene setup
    const scene = new THREE.Scene();

    // Cube scene setup
    const cubeScene = new THREE.Scene();

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
    renderer.domElement.style.zIndex = "1"; // Lower z-index than text content

    container.appendChild(renderer.domElement);

    // Create morphing geometries
    const rectGeometry = new THREE.BoxGeometry(0.4, 0.2, 0.2);

    // Create a single geometry that will morph
    const morphGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);

    // Add the rectangle as a morph target
    const rectPositions = rectGeometry.attributes.position.array;
    morphGeometry.morphAttributes.position = [];
    morphGeometry.morphAttributes.position[0] =
      new THREE.Float32BufferAttribute(rectPositions, 3);

    // Create morphing material
    const cubeMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 100,
      specular: 0x444444,
      transparent: true,
      opacity: 0, // Start invisible
    });

    // Create morphing mesh
    const cube = new THREE.Mesh(morphGeometry, cubeMaterial);
    cube.position.set(0, 0.2, 0);
    cubeScene.add(cube);
    cubeRef.current = cube;

    // Add lights for the cube
    const cubeAmbientLight = new THREE.AmbientLight(0x404040);
    const cubePointLight = new THREE.PointLight(0x00ffff, 1);
    cubePointLight.position.set(2, 2, 2);
    cubeScene.add(cubeAmbientLight);
    cubeScene.add(cubePointLight);

    // Animation
    let time = 0;
    let morphTime = 0;
    let lastMorphState = "cube"; // Track the current shape for debugging
    let isPaused = false;
    let pauseStartTime = 0;
    let currentShape = "cube";

    function animate(currentTime: number) {
      time += ANIMATION_SPEED;

      // Handle morphing
      if (cubeRef.current) {
        if (isPaused) {
          // During pause, maintain current shape and just rotate
          const pauseElapsed = currentTime - pauseStartTime;
          if (pauseElapsed >= SHAPE_PAUSE_DURATION) {
            isPaused = false;
            morphTime = 0;
          }
        } else {
          // During morphing
          morphTime += ANIMATION_SPEED * 1000; // Convert to milliseconds
          const morphProgress = morphTime / MORPH_DURATION;

          if (morphProgress >= 1) {
            // Morph complete, start pause
            isPaused = true;
            pauseStartTime = currentTime;
            currentShape = currentShape === "cube" ? "rectangle" : "cube";

            // Debug logging for shape changes
            console.log("[OverlayCube] Shape changed:", {
              from: lastMorphState,
              to: currentShape,
              timestamp: new Date().toISOString(),
            });
            lastMorphState = currentShape;
          } else {
            // Smooth easing for morphing
            const easedProgress =
              morphProgress < 0.5
                ? 4 * morphProgress * morphProgress * morphProgress
                : 1 - Math.pow(-2 * morphProgress + 2, 3) / 2;

            // Update morph target influence
            const targetInfluence =
              currentShape === "cube" ? 1 - easedProgress : easedProgress;
            cubeRef.current.morphTargetInfluences![0] = targetInfluence;
          }
        }

        // Update rotation (happens during both pause and morph)
        cubeRef.current.rotation.x = time * CUBE_ROTATION_SPEED.x;
        cubeRef.current.rotation.y = time * CUBE_ROTATION_SPEED.y;
      }

      // Optimize rendering
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(scene, camera);

      if (cubeOpacityRef.current > 0) {
        renderer.render(cubeScene, cubeCamera);
      }

      requestAnimationFrame(animate);
    }

    // Start animation loop
    animate(performance.now());

    // Optimize resize handler with debounce
    let resizeTimeout: NodeJS.Timeout;
    function handleResize() {
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        const newDivHeight = window.innerHeight * 0.6;
        const newDivWidth = Math.min(window.innerWidth * 0.8, 700);
        const newAspect = newDivWidth / newDivHeight;

        camera.aspect = newAspect;
        camera.updateProjectionMatrix();
        cubeCamera.aspect = newAspect;
        cubeCamera.updateProjectionMatrix();
        renderer.setSize(newDivWidth, newDivHeight);
      }, 250);
    }
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (container && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // Empty dependency array - only run once on mount

  // Handle text display updates
  useEffect(() => {
    if (textContentRef.current && displayedText) {
      console.log("[OverlayCube] Displaying text:", {
        textLength: displayedText.length,
        timestamp: new Date().toISOString(),
      });

      // Set the text content
      textContentRef.current.textContent = displayedText;

      // Check scrollability and show indicator if needed
      setTimeout(() => {
        if (textContentRef.current) {
          const textElement = textContentRef.current;
          const scrollIndicator = document.querySelector(
            "#overlay-cube-canvas .scroll-indicator"
          );

          if (scrollIndicator) {
            const isScrollable =
              textElement.scrollHeight > textElement.clientHeight;

            if (isScrollable) {
              scrollIndicator.classList.add("visible");
            } else {
              scrollIndicator.classList.remove("visible");
            }
          }
        }
      }, 10);

      // Fade in the text
      const startTime = performance.now();
      const fadeIn = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / FADE_DURATION, 1);

        // Smooth easing
        const easedProgress =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        textContentRef.current!.style.opacity = String(easedProgress);

        if (progress < 1) {
          requestAnimationFrame(fadeIn);
        } else {
          console.log(
            "[OverlayCube] Text fade in complete, dispatching event",
            {
              timestamp: new Date().toISOString(),
              textLength: displayedText.length,
            }
          );
          window.dispatchEvent(new CustomEvent("textRenderComplete"));
        }
      };

      requestAnimationFrame(fadeIn);
    }
  }, [displayedText]);

  // Handle scroll indicator visibility
  useEffect(() => {
    const handleScroll = () => {
      console.log("[OverlayCube] Scroll event detected", {
        scrollTop: textContentRef.current?.scrollTop,
        scrollHeight: textContentRef.current?.scrollHeight,
        clientHeight: textContentRef.current?.clientHeight,
      });

      if (textContentRef.current) {
        const textElement = textContentRef.current;
        const scrollIndicator = document.querySelector(
          "#overlay-cube-canvas .scroll-indicator"
        );

        if (scrollIndicator) {
          const isScrollable =
            textElement.scrollHeight > textElement.clientHeight;
          const isAtBottom =
            textElement.scrollTop + textElement.clientHeight >=
            textElement.scrollHeight - 5;

          if (isScrollable && !isAtBottom) {
            scrollIndicator.classList.add("visible");
          } else {
            scrollIndicator.classList.remove("visible");
          }
        }
      }
    };

    if (textContentRef.current) {
      textContentRef.current.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (textContentRef.current) {
        textContentRef.current.removeEventListener("scroll", handleScroll);
      }
    };
  }, [displayedText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  // Component renders everything through DOM manipulation, so return null
  return null;
}
