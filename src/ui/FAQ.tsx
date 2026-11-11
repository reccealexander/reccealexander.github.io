import { LAYOUT } from "@/lib/journey";
import { useAct } from "@/lib/scroll";

/**
 * The foot of the plant.
 *
 * This act used to carry the FAQ. It carries nothing now: it is the camera
 * settling at the soil while the ant finishes her climb down the stem, and then
 * the climb back out begins. It still registers as an act — the journey is
 * timed off measured sections, and taking it out would retime everything after
 * it — so it is pure scroll length, one fixed height.
 */
export default function FAQ() {
  const section = useAct("faq");
  return (
    <section
      ref={section as React.RefObject<HTMLElement>}
      className="relative"
      style={{ height: `${LAYOUT.soilVh}svh` }}
    />
  );
}
