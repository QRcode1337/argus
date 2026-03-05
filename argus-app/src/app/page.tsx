import { CesiumGlobe } from "@/components/CesiumGlobe";
import { TestErrorButton } from "@/components/TestErrorButton";

export default function Home() {
  return (
    <>
      <CesiumGlobe />
      <TestErrorButton />
    </>
  );
}
