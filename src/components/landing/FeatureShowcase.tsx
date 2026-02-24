'use client'

import { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Text, RoundedBox, MeshTransmissionMaterial, Line } from '@react-three/drei'
import * as THREE from 'three'

interface FeatureBoxProps {
  position: [number, number, number]
  color: string
  icon: string
  isActive: boolean
  onClick: () => void
}

function FeatureBox({ position, color, icon, isActive, onClick }: FeatureBoxProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((state) => {
    if (meshRef.current) {
      const scale = isActive ? 1.2 : hovered ? 1.1 : 1
      meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1)
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3
    }
  })

  return (
    <Float
      speed={2}
      rotationIntensity={0.2}
      floatIntensity={0.5}
    >
      <group position={position}>
        <RoundedBox
          ref={meshRef}
          args={[1, 1, 1]}
          radius={0.1}
          smoothness={4}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onClick={onClick}
        >
          <MeshTransmissionMaterial
            backside
            samples={16}
            resolution={512}
            transmission={0.8}
            roughness={0.3}
            thickness={0.5}
            ior={1.5}
            chromaticAberration={0.1}
            color={color}
          />
        </RoundedBox>
        <Text
          position={[0, 0, 0.6]}
          fontSize={0.4}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {icon}
        </Text>
      </group>
    </Float>
  )
}

function ConnectingLines({ activeIndex }: { activeIndex: number }) {
  void activeIndex // Suppress unused variable warning

  const positions: [number, number, number][] = [
    [-2.5, 0, 0],
    [0, 1.5, 0],
    [2.5, 0, 0],
    [0, -1.5, 0],
    [-2.5, 0, 0], // Close the loop
  ]

  return (
    <Line
      points={positions}
      color="#3b82f6"
      transparent
      opacity={0.5}
      lineWidth={2}
    />
  )
}

function DataFlow() {
  const sphereRef = useRef<THREE.Mesh>(null)
  const positions: [number, number, number][] = [
    [-2.5, 0, 0],
    [0, 1.5, 0],
    [2.5, 0, 0],
    [0, -1.5, 0],
  ]

  useFrame((state) => {
    if (sphereRef.current) {
      const t = (state.clock.elapsedTime * 0.3) % 1
      const index = Math.floor(t * positions.length)
      const nextIndex = (index + 1) % positions.length
      const localT = (t * positions.length) % 1

      const current = new THREE.Vector3(...positions[index])
      const next = new THREE.Vector3(...positions[nextIndex])
      sphereRef.current.position.lerpVectors(current, next, localT)
    }
  })

  return (
    <mesh ref={sphereRef}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshBasicMaterial color="#60a5fa" />
    </mesh>
  )
}

function Scene({ activeIndex, onFeatureClick }: { activeIndex: number; onFeatureClick: (index: number) => void }) {
  const features = [
    { position: [-2.5, 0, 0] as [number, number, number], color: '#1e40af', icon: '🔐' },
    { position: [0, 1.5, 0] as [number, number, number], color: '#0369a1', icon: '👥' },
    { position: [2.5, 0, 0] as [number, number, number], color: '#0e7490', icon: '🛡️' },
    { position: [0, -1.5, 0] as [number, number, number], color: '#0d9488', icon: '📊' },
  ]

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#3b82f6" />

      <ConnectingLines activeIndex={activeIndex} />
      <DataFlow />

      {features.map((feature, index) => (
        <FeatureBox
          key={index}
          position={feature.position}
          color={feature.color}
          icon={feature.icon}
          isActive={activeIndex === index}
          onClick={() => onFeatureClick(index)}
        />
      ))}
    </>
  )
}

const featureDetails = [
  {
    title: 'End-to-End Encryption',
    description: 'Your secrets are encrypted with AES-256 before leaving your browser. Only you and your team can access them.',
    icon: '🔐',
  },
  {
    title: 'Team Collaboration',
    description: 'Invite team members, create organizations, and manage access with granular role-based permissions.',
    icon: '👥',
  },
  {
    title: 'Secure Access Control',
    description: 'Define who can view, edit, or manage each secret. Protect sensitive data at every level.',
    icon: '🛡️',
  },
  {
    title: 'Audit & Compliance',
    description: 'Complete audit trail of every access and modification. Stay compliant with SOC2, GDPR, and HIPAA.',
    icon: '📊',
  },
]

export default function FeatureShowcase() {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <section className="relative py-24" id="showcase">
      <div className="container mx-auto px-4 md:px-6">
        <h2 className="text-center text-3xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
          Built for Security-First Teams
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-600 dark:text-zinc-400">
          Click on each cube to explore our core security features
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="relative h-[400px] rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-zinc-100 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
            <Canvas
              camera={{ position: [0, 0, 6], fov: 50 }}
              dpr={[1, 2]}
            >
              <Scene activeIndex={activeIndex} onFeatureClick={setActiveIndex} />
            </Canvas>
          </div>

          <div className="flex flex-col justify-center space-y-6">
            {featureDetails.map((feature, index) => (
              <button
                key={index}
                onClick={() => setActiveIndex(index)}
                className={`rounded-xl border p-6 text-left transition-all ${
                  activeIndex === index
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{feature.icon}</span>
                  <h3 className={`text-lg font-semibold ${
                    activeIndex === index ? 'text-blue-900 dark:text-blue-100' : 'text-zinc-900 dark:text-zinc-100'
                  }`}>
                    {feature.title}
                  </h3>
                </div>
                <p className={`mt-2 text-sm ${
                  activeIndex === index ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-600 dark:text-zinc-400'
                }`}>
                  {feature.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
