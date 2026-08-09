"use client";

import {
  SectionRuler,
  SectionStatusBar,
  useActiveSection,
} from "@/components/marketing";
import { SECTIONS, SECTION_IDS } from "./sections";

export function Chrome() {
  const active = useActiveSection(SECTION_IDS);

  return (
    <>
      <SectionRuler sections={SECTIONS} active={active} />
      <SectionStatusBar sections={SECTIONS} active={active} brand="envpilot" />
    </>
  );
}
