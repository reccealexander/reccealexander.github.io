import { LAYOUT } from "@/lib/journey";
import { useAct } from "@/lib/scroll";

/**
 * The move from the field to one flower out of it.
 *
 * This act belongs to the camera and carries no copy at all: it is pure scroll
 * length, the run the camera needs to get from standing in the grass to the
 * bloom filling the frame. It still registers as an act, because the journey is
 * timed off measured sections and taking it out would retime everything after.
 */
export default function Approach() {
  const section = useAct("approach");

  return (
    <section
      ref={section as React.RefObject<HTMLElement>}
      className="relative"
      style={{ height: `${LAYOUT.approachVh}svh` }}
    />
  );
}
