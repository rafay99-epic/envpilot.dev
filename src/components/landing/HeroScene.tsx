'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Environment, Sphere } from '@react-three/drei'
import * as THREE from 'three'

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function ParticleField() {
  const particlesRef = useRef<THREE.Points>(null)
  const count = 200

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (pseudoRandom(i + 1) - 0.5) * 10
      pos[i * 3 + 1] = (pseudoRandom(i + 101) - 0.5) * 10
      pos[i * 3 + 2] = (pseudoRandom(i + 201) - 0.5) * 10
    }
    return pos
  }, [])

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02
      particlesRef.current.rotation.x = state.clock.elapsedTime * 0.01
    }
  })

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [positions])

  return (
    <points ref={particlesRef} geometry={geometry}>
      <pointsMaterial
        size={0.02}
        color="#3b82f6"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  )
}

function VaultCore() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3
      meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.1
    }
  })

  return (
    <Float
      speed={2}
      rotationIntensity={0.5}
      floatIntensity={1}
    >
      <mesh ref={meshRef} scale={1.5}>
        <icosahedronGeometry args={[1, 1]} />
        <MeshDistortMaterial
          color="#1e3a8a"
          roughness={0.1}
          metalness={0.8}
          distort={0.2}
          speed={2}
        />
      </mesh>
    </Float>
  )
}

function ShieldRings() {
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const ring3Ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.4
      ring1Ref.current.rotation.y = t * 0.2
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = -t * 0.3
      ring2Ref.current.rotation.z = t * 0.4
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.y = t * 0.5
      ring3Ref.current.rotation.z = -t * 0.3
    }
  })

  return (
    <group scale={1.5}>
      <mesh ref={ring1Ref}>
        <torusGeometry args={[1.2, 0.02, 16, 100]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh ref={ring2Ref}>
        <torusGeometry args={[1.4, 0.015, 16, 100]} />
        <meshStandardMaterial color="#60a5fa" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh ref={ring3Ref}>
        <torusGeometry args={[1.6, 0.01, 16, 100]} />
        <meshStandardMaterial color="#93c5fd" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  )
}

function GlowingSphere() {
  return (
    <Sphere args={[0.5, 32, 32]} position={[0, 0, 0]}>
      <meshBasicMaterial color="#3b82f6" transparent opacity={0.15} />
    </Sphere>
  )
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#3b82f6" />
      <spotLight
        position={[0, 5, 5]}
        angle={0.3}
        penumbra={1}
        intensity={1}
        castShadow
      />

      <VaultCore />
      <ShieldRings />
      <GlowingSphere />
      <ParticleField />

      <Environment preset="city" />
    </>
  )
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-zinc-950" />
    </div>
  )
}
