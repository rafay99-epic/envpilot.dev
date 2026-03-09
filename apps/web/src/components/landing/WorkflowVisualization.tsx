"use client";

import { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Cylinder, Sphere, Line, Text } from "@react-three/drei";
import * as THREE from "three";

interface StepNodeProps {
  position: [number, number, number];
  label: string;
  isActive: boolean;
  isCompleted: boolean;
  stepNumber: number;
}

function StepNode({
  position,
  label,
  isActive,
  isCompleted,
  stepNumber,
}: StepNodeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (groupRef.current) {
      const targetScale = isActive ? 1.2 : hovered ? 1.1 : 1;
      groupRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );

      if (isActive) {
        groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      }
    }
  });

  const color = isCompleted ? "#22c55e" : isActive ? "#3b82f6" : "#71717a";

  return (
    <Float
      speed={isActive ? 3 : 1}
      rotationIntensity={0.1}
      floatIntensity={isActive ? 0.5 : 0.2}
    >
      <group
        ref={groupRef}
        position={position}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {/* Outer ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.4, 0.05, 16, 32]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Inner core */}
        <Sphere args={[0.25, 32, 32]}>
          <meshStandardMaterial
            color={color}
            metalness={0.5}
            roughness={0.3}
            emissive={color}
            emissiveIntensity={isActive ? 0.5 : 0.1}
          />
        </Sphere>

        {/* Step number */}
        <Text
          position={[0, 0, 0.3]}
          fontSize={0.2}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {stepNumber.toString()}
        </Text>

        {/* Glow effect */}
        {isActive && (
          <Sphere args={[0.5, 16, 16]}>
            <meshBasicMaterial color={color} transparent opacity={0.15} />
          </Sphere>
        )}
      </group>
    </Float>
  );
}

function ConnectionPipe({
  start,
  end,
  isActive,
}: {
  start: [number, number, number];
  end: [number, number, number];
  isActive: boolean;
}) {
  return (
    <Line
      points={[start, end]}
      color={isActive ? "#3b82f6" : "#52525b"}
      lineWidth={isActive ? 3 : 2}
      transparent
      opacity={isActive ? 0.8 : 0.4}
      dashed={!isActive}
      dashSize={0.1}
      dashScale={2}
    />
  );
}

function DataPacket({
  from,
  to,
  progress,
}: {
  from: [number, number, number];
  to: [number, number, number];
  progress: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      const startVec = new THREE.Vector3(...from);
      const endVec = new THREE.Vector3(...to);
      meshRef.current.position.lerpVectors(startVec, endVec, progress);
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.1, 0.1, 0.1]} />
      <meshStandardMaterial
        color="#60a5fa"
        emissive="#3b82f6"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

function Scene({ activeStep }: { activeStep: number }) {
  const steps: { position: [number, number, number]; label: string }[] = [
    { position: [-3, 0, 0], label: "Create" },
    { position: [-1, 0, 0], label: "Encrypt" },
    { position: [1, 0, 0], label: "Store" },
    { position: [3, 0, 0], label: "Share" },
  ];

  const [packetProgress, setPacketProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPacketProgress((prev) => (prev + 0.02) % 1);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-5, 5, 5]} intensity={0.5} color="#3b82f6" />

      {/* Connection pipes */}
      {steps.slice(0, -1).map((step, index) => (
        <ConnectionPipe
          key={index}
          start={step.position}
          end={steps[index + 1].position}
          isActive={index === activeStep || index === activeStep - 1}
        />
      ))}

      {/* Data packet animation */}
      {activeStep > 0 && activeStep < steps.length && (
        <DataPacket
          from={steps[activeStep - 1].position}
          to={steps[activeStep].position}
          progress={packetProgress}
        />
      )}

      {/* Step nodes */}
      {steps.map((step, index) => (
        <StepNode
          key={index}
          position={step.position}
          label={step.label}
          isActive={index === activeStep}
          isCompleted={index < activeStep}
          stepNumber={index + 1}
        />
      ))}
    </>
  );
}

const workflowSteps = [
  {
    title: "Create Variables",
    description:
      "Add your environment variables through our intuitive interface or import from existing .env files.",
  },
  {
    title: "Automatic Encryption",
    description:
      "Every variable is encrypted with AES-256 before being transmitted. Your secrets never leave your browser unencrypted.",
  },
  {
    title: "Secure Storage",
    description:
      "Encrypted data is stored in our distributed vault system with automatic backups and versioning.",
  },
  {
    title: "Team Sharing",
    description:
      "Share with your team using role-based access control. Everyone gets exactly the access they need.",
  },
];

export default function WorkflowVisualization() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % workflowSteps.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="border-t border-zinc-200 bg-zinc-50 py-24 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="container mx-auto px-4 md:px-6">
        <h2 className="text-center text-3xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
          How Envpilot Works
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-600 dark:text-zinc-400">
          A simple, secure workflow for managing your environment variables
        </p>

        <div className="mt-12">
          <div className="relative h-[300px] rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <Canvas camera={{ position: [0, 2, 6], fov: 50 }} dpr={[1, 2]}>
              <Scene activeStep={activeStep} />
            </Canvas>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <button
                key={index}
                onClick={() => setActiveStep(index)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  activeStep === index
                    ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      index < activeStep
                        ? "bg-green-500 text-white"
                        : activeStep === index
                          ? "bg-blue-500 text-white"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {index < activeStep ? "✓" : index + 1}
                  </span>
                  <h3
                    className={`text-sm font-semibold ${
                      activeStep === index
                        ? "text-blue-900 dark:text-blue-100"
                        : "text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    {step.title}
                  </h3>
                </div>
                <p
                  className={`mt-2 text-xs ${
                    activeStep === index
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {step.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
