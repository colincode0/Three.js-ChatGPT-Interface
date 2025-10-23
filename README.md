# LLM Resume - Interactive 3D AI Chat Experience

This web application combines **Three.js 3D graphics** with **OpenAI's GPT-4 Turbo** to create an immersive, interactive AI chat experience. Users interact with a 3D brain model through natural language, receiving AI-generated responses displayed in a sleek, animated interface.

🌐 **Live Demo**: [https://www.threejsllm.online/](https://www.threejsllm.online/)

## 🎯 What It Does

This project creates a unique AI chat interface where:

- Users interact with a **3D brain model** in a Three.js scene
- **Camera movements** respond to user input, creating dynamic visual feedback
- **AI responses** are displayed in an elegant, animated text overlay
- **Morphing 3D cubes** provide visual loading states during AI processing
- **Smooth animations** and transitions create a polished user experience

## 🏗️ Architecture Overview

### Frontend Stack

- **Next.js 15** - React framework with App Router
- **Three.js** - 3D graphics and WebGL rendering
- **React Three Fiber** - React integration for Three.js
- **Framer Motion** - Smooth animations and transitions
- **Tailwind CSS** - Utility-first styling
- **TypeScript** - Type-safe development

### Backend & AI

- **OpenAI GPT-4 Turbo** - AI language model
- **Vercel Serverless Functions** - API endpoints
- **Streaming Responses** - Real-time AI text generation
- **Error Handling** - Robust API error management

## 🚀 Key Features

### 3D Visual Experience

- **Interactive Brain Model** - Central 3D object users interact with
- **Dynamic Camera Movement** - Smooth camera transitions on user input
- **Morphing Loading Cube** - Animated 3D shapes during AI processing
- **Post-Processing Effects** - Bloom, outline, and vignette effects

### AI Chat Integration

- **Real-time Streaming** - Live AI response generation
- **Context-Aware Responses** - Maintains conversation history
- **Error Handling** - Graceful API failure management
- **Timeout Protection** - Prevents endless loading states

### User Experience

- **Responsive Design** - Works on desktop and mobile
- **Smooth Animations** - 60fps animations with easing functions
- **Loading States** - Visual feedback during processing
- **Scrollable Responses** - Handle long AI responses elegantly

## 🔧 Technical Implementation

### State Management

The application uses a state machine with four main states:

```typescript
type SequenceState =
  | "idle" // Ready for input
  | "loading" // Camera moving + AI processing
  | "text_rendering" // Text animation phase
  | "complete"; // Response displayed
```

### 3D Scene Components

- **Scene.tsx** - Main Three.js scene with brain model and camera controls
- **OverlayCube.tsx** - Loading animations and text display overlay
- **SceneWrapper.tsx** - State management and AI chat integration

### API Architecture

- **Stateless Design** - Each request is independent
- **Concurrent User Support** - Multiple users can interact simultaneously
- **Streaming Responses** - Real-time AI text generation
- **Error Recovery** - Handles API failures gracefully

## 📊 Performance Optimizations

### Frontend Optimizations

- **Animation Throttling** - 60fps cap for smooth performance
- **Memory Management** - Proper cleanup of Three.js resources
- **Code Splitting** - Optimized bundle sizes
- **Image Optimization** - Efficient asset loading

### Backend Optimizations

- **Request Timeouts** - 30-second API timeout protection
- **Error Handling** - Comprehensive error management
- **Streaming Responses** - Efficient real-time data transfer
- **Rate Limiting** - Built-in API quota management

## 🔒 Security & Privacy

- **No Data Storage** - Conversations are not persisted
- **API Key Security** - Server-side only, never exposed to client
- **Input Validation** - Sanitized user inputs
- **Error Sanitization** - Safe error message handling

## 🌐 Multi-User Support

The application is designed to handle multiple concurrent users:

- **Stateless API** - Each request is independent
- **Client-Side Isolation** - No shared state between users
- **Automatic Scaling** - Vercel handles traffic spikes
- **Rate Limit Handling** - Graceful API quota management

## 🎨 Customization

### Styling

- Modify `tailwind.config.js` for design system changes
- Update CSS variables in `globals.css` for color schemes
- Customize Three.js materials in `Scene.tsx`

### AI Behavior

- Adjust `temperature` in `route.ts` for response creativity
- Modify system prompts for different AI personalities
- Update timeout values for different response times

### 3D Scene

- Replace brain model with custom 3D objects
- Adjust camera movement patterns
- Modify lighting and post-processing effects

For questions, issues, or contributions:

- Open an issue on GitHub
- Check the live demo: [https://www.threejsllm.online/](https://www.threejsllm.online/)
