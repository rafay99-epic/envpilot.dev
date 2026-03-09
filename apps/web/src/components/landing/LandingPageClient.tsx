"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

// Dynamically import 3D components to avoid SSR issues
const HeroScene = dynamic(() => import("@/components/landing/HeroScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 -z-10 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950" />
  ),
});

const FeatureShowcase = dynamic(
  () => import("@/components/landing/FeatureShowcase"),
  {
    ssr: false,
    loading: () => <FeatureShowcaseSkeleton />,
  },
);

const WorkflowVisualization = dynamic(
  () => import("@/components/landing/WorkflowVisualization"),
  {
    ssr: false,
    loading: () => <WorkflowSkeleton />,
  },
);

const UseCasesSection = dynamic(
  () => import("@/components/landing/UseCasesSection"),
  {
    ssr: false,
    loading: () => <UseCasesSkeleton />,
  },
);

function FeatureShowcaseSkeleton() {
  return (
    <section className="relative py-24" id="showcase">
      <div className="container mx-auto px-4 md:px-6">
        <div className="h-8 w-64 mx-auto rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-4 w-96 mx-auto mt-4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="h-[400px] rounded-2xl bg-zinc-100 dark:bg-zinc-900 animate-pulse" />
          <div className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-xl bg-zinc-100 dark:bg-zinc-900 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowSkeleton() {
  return (
    <section className="border-t border-zinc-200 bg-zinc-50 py-24 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="container mx-auto px-4 md:px-6">
        <div className="h-8 w-64 mx-auto rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <div className="h-4 w-96 mx-auto mt-4 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <div className="mt-12 h-[300px] rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
    </section>
  );
}

function UseCasesSkeleton() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="h-8 w-64 mx-auto rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-4 w-96 mx-auto mt-4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="h-[400px] rounded-2xl bg-zinc-100 dark:bg-zinc-900 animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-zinc-100 dark:bg-zinc-900 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HeroSceneWrapper() {
  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950" />
      }
    >
      <HeroScene />
    </Suspense>
  );
}

export function FeatureShowcaseWrapper() {
  return (
    <Suspense fallback={<FeatureShowcaseSkeleton />}>
      <FeatureShowcase />
    </Suspense>
  );
}

export function WorkflowVisualizationWrapper() {
  return (
    <Suspense fallback={<WorkflowSkeleton />}>
      <WorkflowVisualization />
    </Suspense>
  );
}

export function UseCasesSectionWrapper() {
  return (
    <Suspense fallback={<UseCasesSkeleton />}>
      <UseCasesSection />
    </Suspense>
  );
}
