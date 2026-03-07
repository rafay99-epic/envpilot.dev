'use client'

import { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, RoundedBox, Text, MeshWobbleMaterial } from '@react-three/drei'
import * as THREE from 'three'

interface UseCaseIconProps {
  position: [number, number, number]
  color: string
  icon: string
  rotation?: [number, number, number]
}

function UseCaseIcon({ position, color, icon, rotation = [0, 0, 0] }: UseCaseIconProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5
    }
  })

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
      <group position={position} rotation={rotation}>
        <RoundedBox ref={meshRef} args={[0.6, 0.6, 0.6]} radius={0.08} smoothness={4}>
          <MeshWobbleMaterial color={color} factor={0.1} speed={2} metalness={0.5} roughness={0.3} />
        </RoundedBox>
        <Text
          position={[0, 0, 0.35]}
          fontSize={0.25}
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

function OrbitingParticles() {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.3
    }
  })

  const particles = Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * Math.PI * 2
    const radius = 2
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin((i + 1) * 3.17) * 0.25,
      z: Math.sin(angle) * radius,
    }
  })

  return (
    <group ref={groupRef}>
      {particles.map((pos, i) => (
        <mesh key={i} position={[pos.x, pos.y, pos.z]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color="#60a5fa" />
        </mesh>
      ))}
    </group>
  )
}

function Scene() {
  const useCases = [
    { position: [-1.5, 0.8, 0] as [number, number, number], color: '#1e40af', icon: '🚀', rotation: [0, 0, 0.2] as [number, number, number] },
    { position: [1.5, 0.8, 0] as [number, number, number], color: '#0369a1', icon: '🔧', rotation: [0, 0, -0.2] as [number, number, number] },
    { position: [-1.5, -0.8, 0] as [number, number, number], color: '#0e7490', icon: '🏢', rotation: [0, 0, -0.2] as [number, number, number] },
    { position: [1.5, -0.8, 0] as [number, number, number], color: '#0d9488', icon: '🔬', rotation: [0, 0, 0.2] as [number, number, number] },
  ]

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-5, -5, 5]} intensity={0.5} color="#3b82f6" />

      <OrbitingParticles />

      {useCases.map((useCase, index) => (
        <UseCaseIcon
          key={index}
          position={useCase.position}
          color={useCase.color}
          icon={useCase.icon}
          rotation={useCase.rotation}
        />
      ))}

      {/* Central connecting hub */}
      <Float speed={1} rotationIntensity={0.1} floatIntensity={0.3}>
        <mesh position={[0, 0, 0]}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.8} roughness={0.2} emissive="#3b82f6" emissiveIntensity={0.3} />
        </mesh>
      </Float>
    </>
  )
}

const useCases = [
  {
    icon: '🚀',
    title: 'Startups & Scale-ups',
    description: 'Move fast without compromising security. Quick setup, easy onboarding, and scales with your team.',
    benefits: ['5-minute setup', 'Unlimited projects', 'Free tier available'],
  },
  {
    icon: '🔧',
    title: 'DevOps Teams',
    description: 'Integrate with your CI/CD pipeline. Pull secrets directly into your builds and deployments.',
    benefits: ['CLI tool', 'GitHub Actions', 'Docker support'],
  },
  {
    icon: '🏢',
    title: 'Enterprise Organizations',
    description: 'SOC2 compliant, SAML SSO, and advanced audit logs for enterprise security requirements.',
    benefits: ['SSO integration', 'Compliance reports', 'Priority support'],
  },
  {
    icon: '🔬',
    title: 'Open Source Projects',
    description: 'Manage secrets across contributors without exposing sensitive data in your repository.',
    benefits: ['Public projects', 'Contributor access', 'Free for OSS'],
  },
]

export default function UseCasesSection() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <section className="py-24">
      <div className="container mx-auto px-4 md:px-6">
        <h2 className="text-center text-3xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
          Built for Every Team
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-600 dark:text-zinc-400">
          From solo developers to enterprise organizations, ENV Connect adapts to your workflow
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="relative h-[400px] rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-zinc-100 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
            <Canvas
              camera={{ position: [0, 0, 5], fov: 50 }}
              dpr={[1, 2]}
            >
              <Scene />
            </Canvas>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className="rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span className="text-3xl">{useCase.icon}</span>
                <h3 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {useCase.title}
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {useCase.description}
                </p>
                <ul className="mt-3 space-y-1">
                  {useCase.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                      <span className="text-green-500">✓</span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
