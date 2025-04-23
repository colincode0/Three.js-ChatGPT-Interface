// import Image from "next/image";
import SceneWrapper from "../components/SceneWrapper";

export default function Home() {
  return (
    <>
      <SceneWrapper />
      <div className="relative min-h-screen flex items-center justify-center">
        <main className="text-white">
          <p className="text-4xl font-light">Hello</p>
        </main>
      </div>
    </>
  );
}
