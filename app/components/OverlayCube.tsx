import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Message } from "ai";
import { devLog } from "./devLog";

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

  devLog("Cleaned text:", cleanedText);
  return cleanedText;
}

// Cache common values
const FADE_DURATION = 400;
const FRAME_MS = 1000 / 60; // Cube speeds below were tuned per 60fps frame
const MAX_FRAME_DELTA = 100; // ms - avoid jumps after the tab was hidden
const ANIMATION_SPEED = 0.01;
const CUBE_ROTATION_SPEED = { x: 0.5, y: 0.3 };
const MORPH_DURATION = 800; // Duration for morphing transition
const SHAPE_PAUSE_DURATION = 810; // 0.81 second pause at each shape

// Optimized easing function - reused throughout component
const easeInOutCubic = (progress: number): number => {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

// Eased opacity fade on a DOM element
const animateOpacity = (
  element: HTMLElement,
  from: number,
  to: number,
  onComplete?: () => void
) => {
  const startTime = performance.now();
  const step = () => {
    const progress = Math.min(
      (performance.now() - startTime) / FADE_DURATION,
      1
    );
    element.style.opacity = String(
      from + (to - from) * easeInOutCubic(progress)
    );
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  };
  requestAnimationFrame(step);
};

// DOM creation utilities
const createStyledElement = (
  tag: string,
  styles: Record<string, string>,
  className?: string
): HTMLElement => {
  const element = document.createElement(tag) as HTMLElement;
  Object.assign(element.style, styles);
  if (className) element.className = className;
  return element;
};

const createScrollbarStyles = (): HTMLStyleElement => {
  const style = document.createElement("style");
  style.textContent = `
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
    
    /* Mobile responsive styles for loading text */
    @media (max-width: 768px) {
      #overlay-cube-canvas .loading-text-container {
        font-size: 0.9rem !important;
        padding: 0 0.5rem !important;
        max-width: 95% !important;
        top: 58% !important;
      }
      #overlay-cube-canvas .loading-text-container > div:first-child {
        font-size: 0.9rem !important;
        margin-bottom: 0.2rem !important;
      }
      #overlay-cube-canvas .loading-text-container > div:last-child {
        font-size: 0.75rem !important;
        line-height: 1.1 !important;
      }
    }
    
    @media (max-width: 480px) {
      #overlay-cube-canvas .loading-text-container {
        font-size: 0.85rem !important;
        padding: 0 0.25rem !important;
        max-width: 98% !important;
        top: 56% !important;
      }
      #overlay-cube-canvas .loading-text-container > div:first-child {
        font-size: 0.85rem !important;
        margin-bottom: 0.15rem !important;
      }
      #overlay-cube-canvas .loading-text-container > div:last-child {
        font-size: 0.7rem !important;
        line-height: 1.0 !important;
      }
    }
  `;
  return style;
};

export default function OverlayCube({
  messages,
  sequenceState,
  lastCompleteContent,
}: OverlayCubeProps) {
  const [displayedText, setDisplayedText] = useState<string>("");
  const isClearingTextRef = useRef(false);
  const loadingTextRef = useRef<HTMLDivElement | null>(null);
  const loadingSubtitleRef = useRef<HTMLDivElement | null>(null);
  const textContentRef = useRef<HTMLDivElement | null>(null);
  const scrollIndicatorRef = useRef<HTMLDivElement | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);
  const cubeOpacityRef = useRef(0);

  const showLoadingCube = useCallback(() => {
    if (!cubeRef.current) return;
    const material = cubeRef.current.material as THREE.MeshPhongMaterial;
    material.opacity = 1;
    cubeOpacityRef.current = 1;
    if (loadingTextRef.current) {
      animateOpacity(loadingTextRef.current, 0, 0.8);
    }
  }, []);

  const fadeOutText = useCallback((onComplete: () => void) => {
    if (!textContentRef.current) return;

    devLog("[OverlayCube] Starting text fade out", {
      timestamp: new Date().toISOString(),
    });

    const textElement = textContentRef.current;
    animateOpacity(textElement, 1, 0, () => {
      devLog("[OverlayCube] Text fade out complete", {
        timestamp: new Date().toISOString(),
      });
      textElement.textContent = "";
      onComplete();
    });
  }, []);

  const fadeOutCube = useCallback(() => {
    if (!cubeRef.current) return;
    if (loadingTextRef.current) {
      animateOpacity(loadingTextRef.current, 0.8, 0);
    }

    devLog("[OverlayCube] Starting cube fade out", {
      timestamp: new Date().toISOString(),
    });

    const material = cubeRef.current.material as THREE.MeshPhongMaterial;
    const startTime = performance.now();

    const animate = () => {
      const progress = Math.min(
        (performance.now() - startTime) / FADE_DURATION,
        1
      );
      const opacity = 1 - easeInOutCubic(progress);
      material.opacity = opacity;
      cubeOpacityRef.current = opacity;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        devLog("[OverlayCube] Cube fade out complete", {
          timestamp: new Date().toISOString(),
        });

        // Start text render after cube is fully faded out
        if (lastCompleteContent) {
          devLog("[OverlayCube] Starting text render after cube fade");
          setDisplayedText(cleanText(lastCompleteContent));
        }
      }
    };

    animate();
  }, [lastCompleteContent]);

  // Handle state changes
  useEffect(() => {
    devLog("[OverlayCube] State Change:", {
      sequenceState,
      hasCompleteContent: !!lastCompleteContent,
      contentLength: lastCompleteContent?.length,
      hasDisplayedText: !!displayedText,
      cubeOpacity: cubeOpacityRef.current,
      timestamp: new Date().toISOString(),
    });

    if (sequenceState === "loading") {
      if (!displayedText) {
        // Show the loading cube unless a fade-out of old text is still running
        if (!isClearingTextRef.current) {
          devLog("[OverlayCube] No displayed text - showing loading cube");
          showLoadingCube();
        }
      } else if (!isClearingTextRef.current) {
        devLog(
          "[OverlayCube] Already have displayed text - fading out text first"
        );
        // Fade out the previous reply, then clear it so the next reply is
        // shown even when its text is identical
        isClearingTextRef.current = true;
        fadeOutText(() => {
          isClearingTextRef.current = false;
          // Re-runs this effect, which then shows the cube or the new reply
          setDisplayedText("");
        });
      }
    } else if (
      sequenceState === "text_rendering" ||
      sequenceState === "complete"
    ) {
      // Fade out the cube once the reply is ready to show
      if (cubeRef.current && cubeOpacityRef.current > 0) {
        devLog("[OverlayCube] Starting cube fade out for text rendering");
        fadeOutCube();
      } else if (
        !displayedText &&
        !isClearingTextRef.current &&
        lastCompleteContent
      ) {
        // Reply arrived while the previous one was still fading out
        setDisplayedText(cleanText(lastCompleteContent));
      }
    } else {
      // idle state
      devLog("[OverlayCube] Idle state - hiding everything");
      setDisplayedText("");

      // Hide cube and loading text
      if (cubeRef.current) {
        const material = cubeRef.current.material as THREE.MeshPhongMaterial;
        material.opacity = 0;
        cubeOpacityRef.current = 0;
      }
      if (loadingTextRef.current) {
        loadingTextRef.current.style.opacity = "0";
      }
      if (textContentRef.current) {
        textContentRef.current.style.opacity = "0";
        textContentRef.current.textContent = "";
      }
    }
  }, [
    sequenceState,
    lastCompleteContent,
    displayedText,
    fadeOutText,
    fadeOutCube,
    showLoadingCube,
  ]);

  // Handle camera movement completion
  useEffect(() => {
    const handleCameraMovementComplete = () => {
      devLog("[OverlayCube] Camera Movement Complete:", {
        hasCompleteContent: !!lastCompleteContent,
        sequenceState,
        timestamp: new Date().toISOString(),
      });

      // Only start text render if we have complete content and we're in loading state
      if (lastCompleteContent && sequenceState === "loading") {
        devLog("[OverlayCube] Starting text render with content:", {
          contentLength: lastCompleteContent.length,
          timestamp: new Date().toISOString(),
        });

        // Set the text content
        setDisplayedText(cleanText(lastCompleteContent));
      } else {
        devLog("[OverlayCube] Not starting text render:", {
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

  // Handle message updates - only update text when we have a new complete message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      devLog("[OverlayCube] Message Update:", {
        role: lastMessage.role,
        sequenceState,
        messageId: lastMessage.id,
        hasContent: !!lastMessage.content,
        contentLength: lastMessage.content.length,
        timestamp: new Date().toISOString(),
      });

      // Only update displayed text when we have a new assistant message and we're in complete state
      // This prevents unnecessary re-renders and state changes
      if (lastMessage.role === "assistant" && sequenceState === "complete") {
        const newText = cleanText(lastMessage.content);
        // Only update if the text is actually different to prevent unnecessary re-renders
        if (newText !== displayedText) {
          devLog("[OverlayCube] Storing new message");
          setDisplayedText(newText);
        }
      }
    }
  }, [messages, sequenceState, displayedText]);

  // Initialize scenes and renderer
  useEffect(() => {
    const container = createStyledElement("div", {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "50",
    });
    container.id = "overlay-cube-canvas";

    const backgroundDiv = createStyledElement("div", {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: "80%",
      maxWidth: "700px",
      height: "60%",
      backgroundColor: "rgb(0, 0, 0)",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      borderRadius: "0.5rem",
      zIndex: "1",
    });

    // Add loading text container INSIDE the black container
    const loadingTextContainer = createStyledElement(
      "div",
      {
        position: "absolute",
        left: "50%",
        top: "60%",
        transform: "translate(-50%, 0)",
        color: "white",
        fontSize: "1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        opacity: "0",
        zIndex: "3",
        textAlign: "center",
        padding: "0 1rem",
        maxWidth: "90%",
        lineHeight: "1.2",
      },
      "loading-text-container"
    );

    // Create main loading text
    const loadingText = document.createElement("div");
    loadingText.textContent = "Loading 3D LLM output";
    loadingText.style.marginBottom = "0.25rem";
    loadingText.style.fontSize = "1rem";
    loadingText.style.letterSpacing = "0.05em";

    // Create subtitle
    const loadingSubtitle = document.createElement("div");
    loadingSubtitle.textContent = "(Longer responses take more time)";
    loadingSubtitle.style.fontSize = "0.8rem";
    loadingSubtitle.style.color = "rgba(255, 255, 255, 0.7)";
    loadingSubtitle.style.fontStyle = "italic";
    loadingSubtitle.style.lineHeight = "1.1";

    loadingTextContainer.appendChild(loadingText);
    loadingTextContainer.appendChild(loadingSubtitle);
    backgroundDiv.appendChild(loadingTextContainer);

    loadingTextRef.current = loadingTextContainer as HTMLDivElement;
    loadingSubtitleRef.current = loadingSubtitle as HTMLDivElement;

    // Add text content area
    const textContent = createStyledElement(
      "div",
      {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "90%",
        height: "80%",
        color: "white",
        fontSize: "0.9rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: "1.6",
        overflowY: "auto",
        overflowX: "hidden",
        padding: "1rem",
        opacity: "0",
        zIndex: "10",
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        boxSizing: "border-box",
        pointerEvents: "auto",
        scrollbarWidth: "thin",
        scrollbarColor: "#333 #222",
      },
      "text-content"
    );

    // Add scrollbar styles
    const scrollbarStyle = createScrollbarStyles();
    document.head.appendChild(scrollbarStyle);

    backgroundDiv.appendChild(textContent);
    textContentRef.current = textContent as HTMLDivElement;

    // Add scroll indicator
    const scrollIndicator = createStyledElement(
      "div",
      {},
      "scroll-indicator"
    );
    backgroundDiv.appendChild(scrollIndicator);
    scrollIndicatorRef.current = scrollIndicator as HTMLDivElement;

    container.appendChild(backgroundDiv);
    document.body.appendChild(container);


    const divHeight = window.innerHeight * 0.6;
    const divWidth = Math.min(window.innerWidth * 0.8, 700);
    const aspect = divWidth / divHeight;

    // Cube scene setup
    const cubeScene = new THREE.Scene();
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
    rectGeometry.dispose();

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

    // Animation loop - only draws while the cube is visible
    let time = 0;
    let morphTime = 0;
    let isPaused = false;
    let pauseStartTime = 0;
    let currentShape = "cube";
    let animationId = 0;
    let lastFrameTime: number | null = null;
    let hasDrawnCube = false;

    function animate(currentTime: number) {
      animationId = requestAnimationFrame(animate);

      const delta =
        lastFrameTime === null
          ? FRAME_MS
          : Math.min(currentTime - lastFrameTime, MAX_FRAME_DELTA);
      lastFrameTime = currentTime;

      if (cubeOpacityRef.current <= 0) {
        // Clear the last visible frame once, then stay idle
        if (hasDrawnCube) {
          renderer.clear();
          hasDrawnCube = false;
        }
        return;
      }

      const frameScale = delta / FRAME_MS;
      time += ANIMATION_SPEED * frameScale;

      // Handle morphing
      if (isPaused) {
        if (currentTime - pauseStartTime >= SHAPE_PAUSE_DURATION) {
          isPaused = false;
          morphTime = 0;
        }
      } else {
        morphTime += ANIMATION_SPEED * 1000 * frameScale;
        const morphProgress = morphTime / MORPH_DURATION;

        if (morphProgress >= 1) {
          isPaused = true;
          pauseStartTime = currentTime;
          currentShape = currentShape === "cube" ? "rectangle" : "cube";
        } else {
          const easedProgress = easeInOutCubic(morphProgress);
          cube.morphTargetInfluences![0] =
            currentShape === "cube" ? 1 - easedProgress : easedProgress;
        }
      }

      cube.rotation.x = time * CUBE_ROTATION_SPEED.x;
      cube.rotation.y = time * CUBE_ROTATION_SPEED.y;

      renderer.render(cubeScene, cubeCamera);
      hasDrawnCube = true;
    }

    // Start animation loop
    animationId = requestAnimationFrame(animate);

    // Optimize resize handler with debounce
    let resizeTimeout: NodeJS.Timeout;
    function handleResize() {
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        const newDivHeight = window.innerHeight * 0.6;
        const newDivWidth = Math.min(window.innerWidth * 0.8, 700);
        cubeCamera.aspect = newDivWidth / newDivHeight;
        cubeCamera.updateProjectionMatrix();
        renderer.setSize(newDivWidth, newDivHeight);
        hasDrawnCube = false;
      }, 250);
    }
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      morphGeometry.dispose();
      cubeMaterial.dispose();
      renderer.dispose();
      container.remove();
      scrollbarStyle?.remove();
      cubeRef.current = null;
    };
  }, []); // Empty dependency array - only run once on mount

  // Handle text display updates
  useEffect(() => {
    if (textContentRef.current && displayedText) {
      devLog("[OverlayCube] Displaying text:", {
        textLength: displayedText.length,
        timestamp: new Date().toISOString(),
      });

      const textElement = textContentRef.current;
      textElement.textContent = displayedText;

      // Check scrollability and show indicator if needed
      requestAnimationFrame(() => {
        const scrollIndicator = scrollIndicatorRef.current;
        if (!scrollIndicator) return;
        const isScrollable = textElement.scrollHeight > textElement.clientHeight;
        scrollIndicator.classList.toggle("visible", isScrollable);
      });

      // Fade in the text
      animateOpacity(textElement, 0, 1, () => {
        devLog("[OverlayCube] Text fade in complete, dispatching event", {
          timestamp: new Date().toISOString(),
          textLength: displayedText.length,
        });
        window.dispatchEvent(new CustomEvent("textRenderComplete"));
      });
    }
  }, [displayedText]);

  // Handle scroll indicator visibility
  useEffect(() => {
    const textElement = textContentRef.current;
    if (!textElement) return;

    const handleScroll = () => {
      const isScrollable = textElement.scrollHeight > textElement.clientHeight;
      const isAtBottom =
        textElement.scrollTop + textElement.clientHeight >=
        textElement.scrollHeight - 5;
      scrollIndicatorRef.current?.classList.toggle(
        "visible",
        isScrollable && !isAtBottom
      );
    };

    textElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => textElement.removeEventListener("scroll", handleScroll);
  }, []);

  // Component renders everything through DOM manipulation, so return null
  return null;
}
