import { useEffect } from "react";
import { initScroll } from "@/lib/scroll";
import { initPointer } from "@/lib/pointer";
import { useRoute, takeFieldScroll } from "@/lib/router";
import { BiomeProvider } from "@/ui/BiomeContext";
import Scene from "@/three/Scene";
import Hero from "@/ui/Hero";
import Approach from "@/ui/Approach";
import Features from "@/ui/Features";
import Steps from "@/ui/Steps";
import FAQ from "@/ui/FAQ";
import Contact from "@/ui/Contact";
import BiomePicker from "@/ui/BiomePicker";
import TimePicker from "@/ui/TimePicker";
import StartBanner from "@/ui/StartBanner";
import LeafPage from "@/ui/LeafPage";
import { cancelGlide } from "@/ui/navTargets";

// Its own scene and its own physics; nobody reading the field pays for it.

/**
 * The field is a normal document — headings, anchors, selectable text — laid
 * over one fixed 3D scene. Every section between the hero and the footer is
 * transparent; nothing may paint a background, because that is the only thing
 * keeping the field on screen the whole way down.
 *
 * The sections are also the timeline. Each one registers itself as an act (see
 * lib/scroll), and the camera's position is a function of which act you are in
 * and how far through it — so the copy can grow a paragraph without anyone
 * having to re-time the journey.
 *
 * There is no header. A leaf's page carries its own way back rather than
 * inheriting one from a bar across the top of every screen.
 */
/*
 * A reload starts at the top, on the opening shot, rather than wherever the
 * browser remembers: the page is a journey that begins in the field, and the
 * groundhog that greets you lives there. Coming back from a leaf's page inside
 * the site still returns you to where you were (takeFieldScroll, below).
 */
if (typeof history !== "undefined" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function Field() {
  useEffect(() => initScroll(), []);

  // Returning from a leaf, the reader goes back to the leaf they opened rather
  // than to the top of a seventeen-thousand-pixel document. On a real back
  // navigation the browser has already restored the position and this is a
  // no-op, because it is the same number.
  useEffect(() => {
    const y = takeFieldScroll();
    if (y > 0) window.scrollTo({ top: y, behavior: "instant" });
  }, []);

  return (
    <>
      {/* Nothing between the hero and the FAQ is focusable except the four
          leaves — the bloom and the stem are a scene, not a form — so the tab
          stops that cross them are thousands of pixels apart. This is the way
          past that. */}
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:rounded-md focus-visible:bg-bloom focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-void"
      >
        Skip to content
      </a>
      <Scene />
      <main id="main" className="relative z-10">
        <Hero />
        <Approach />
        <Features />
        <Steps />
        <FAQ />
        <Contact />
      </main>
      {/* Changes what the field is made of; fades out past the fold. */}
      <BiomePicker />
      {/* Morning, sunset or evening; the opposite corner. */}
      <TimePicker />
      {/* "Try catching the groundhog", once, on opening. */}
      <StartBanner />
      {/* Opened by a click on the groundhog. */}
    </>
  );
}

export default function App() {
  const route = useRoute();

  // The pointer is the field's, but it is initialised here: it is a window
  // listener with no opinion about which route is up, and re-registering it on
  // every navigation would drop the cursor's position each time.
  useEffect(() => initPointer(), []);

  /*
   * Touching the wheel, a key or the screen takes the page back off an
   * animated jump mid-flight, the way a native smooth scroll would have.
   *
   * This used to live inside the nav bar, which was the only thing that
   * started one. The nav is gone and the anchors that remain — the hero's two
   * links, the footer's column — still glide, so the listener outlived its
   * old home and moved here.
   */
  useEffect(() => {
    const stop = () => cancelGlide();
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, []);

  return (
    <BiomeProvider>
      {route.name === "leaf" ? (
        <LeafPage id={route.id} />
      ) : (
        // The bowling alley is put away for now (its code is still in
        // src/bowling; git tag `with-bowling` has it wired in), so its
        // address is just the field.
        <Field />
      )}
    </BiomeProvider>
  );
}
