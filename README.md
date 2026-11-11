# Petal — three.js

The Petal marketing site, rebuilt as one continuous 3D shot with
[react-three-fiber](https://r3f.docs.pmnd.rs/). Same copy, same design system
and the same three acts as the DOM version in `~/Desktop/petal-landing`; what
changes is that the flower those acts are built around is a real object in a
real field, and the whole page is the camera moving over it.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build  →  dist/
npm run preview
```

## The shape of it

The page is a normal document — headings, anchors, selectable text — laid over
one fixed canvas. Every section between the hero and the footer is transparent;
**nothing between them may paint a background**, because that is the only thing
keeping the field on screen the whole way down.

The sections are also the timeline. Each registers itself as an *act*
(`src/lib/scroll.ts`), and the camera's position is a function of a single
number — `chapter`, where the integer part is which act you are in and the
fraction is how far through it. Acts are contiguous blocks in document order, so
an act's local progress reaches 1 exactly as the next one's reaches 0 and the
camera never jumps at a boundary. Because the sections are *measured* rather
than assumed, copy can grow a paragraph without anyone re-timing the journey.

| chapter | act | what the camera does |
| --- | --- | --- |
| 0 | hero | the field, from above |
| 1 | approach | down out of the bird's eye until the grass parts on one flower |
| 2 | bloom | eight petals, eight features, held nearly still |
| 3 | stem | the pan down, with the ant going first |
| 4 | faq | the soil the plant stands in |
| 5 | out | back up to the bird's eye |

The biome picker at the bottom right changes what the field is made of —
meadow, superbloom, deciduous forest, or a Japanese pond whose near bank is the
only grass in the frame. The plant, the camera and every word on the page are
the same in all four.

### Working on a single beat

```js
__petal.seek(3.4)      // from the console: partway down the stem
```

or `?c=3.4` on the URL. `__petal.chapter` reads the live value.

`node scripts/shoot.mjs` drives the real page in headless Chrome, photographs
every act into `shots/`, and fails loudly on any console error — a scene like
this fails silently, so "it builds" is not evidence of anything. `SHOOT=stations`
photographs the eight petals instead; `VIEWPORT=390x844` does it at phone size.

Two things about measuring this scene, both learned expensively:

- **Use real headless, not `headless: "shell"` with a software GL flag.** The
  latter draws this at about 0.4 frames a second; the same sixteen-stop pass
  went from five minutes to thirty seconds on the real GPU. Anything sampling
  frames — hunting a flicker, timing a fade — is worthless at 0.4 fps.
- **Do not measure against the dev server while anything is editing files.**
  Vite's hot update blanks the whole scene for up to thirty seconds, and in a
  screenshot that is indistinguishable from a rendering bug. Build and serve
  statically if something else is writing to the tree.

## Decisions worth knowing before you change something

**There is no sky.** The background is the same haze the far field dissolves
into, and the hero is pitched down past half the field of view so the horizon is
above the top of the frame. Both are load-bearing: the type is near-white and
sits directly on the scene with no scrim, so the palette's one hard rule is that
nothing may average brighter than a mid-dark green. Tilting the camera up, or
lifting `toneMappingExposure`, breaks the hero before it breaks anything else.

**The grass answers no light.** No diffuse term, no specular, no normal. A
blade's colour is decided when it is planted and never changes, and that
flatness is what makes the field read as drawn rather than rendered — it is the
main reason this scene can sit under the same wordmark as the 2D one. Blades are
about a thirteenth as wide as they are tall; at a hundredth they are hairs, and a
field of hairs is a texture rather than a place.

**There is sun on the meadow, and it is still not a light.** The meadow's
palette is taken from a photograph of sunlit grass: deep olive almost
everywhere, broad soft-edged pools running diagonally across the frame, and the
light picked out *per blade* — thousands of separately lit edges against darker
neighbours rather than a glow laid over the canopy. What makes that possible
without breaking the rule above is that the light is a scalar field over the
ground (`src/three/sunlight.ts`): a function of a position in metres, with no
normal, no lamp and no direction in it. Grass.tsx samples it once per blade **at
the blade's own root**, so a blade is wholly in the light or wholly out of it and
the edge of a pool is a thousand blade-shaped decisions; Ground.tsx samples it
per pixel, because a floor has no blades to pick out. Colour still comes from
where a thing is standing. The biome owns the shaded half of the ramp (`deep`,
`bright`) and `sunlight.ts` owns the lit half, because which half a blade takes
is a fact about the field and not about the dressing. The file exports the same
field twice — as GLSL and as TypeScript, generated from one set of constants —
and `scripts/pool-preview.mjs` draws the second one through the journey's own
camera at any chapter, which turns placing this from a thirty-second round trip
through headless Chrome into an instant one.

**Two pools and the fleckwork, which are three different things a canopy does.**
A pool is a hole in the canopy. There are two: the first crosses the upper third
of the hero from the left, the second is the glare in its lower right corner.
The second one is also, and mostly, the fix for a different problem — the last
third of the journey is shot from a lens a hand's width off the soil, sat
entirely outside the first pool, and measured a 95th-percentile luminance of
0.03, which is a frame with no bright pixel anywhere in it. The hero's lower
right corner and the far background of every shot from inside the field are the
same couple of square metres of ground: one looks down into it from three metres
up and the other looks out through it from the floor.

That only reaches so far, because from down there *there is no far field* — the
frame is near blades edge to edge. So the third thing: a canopy that is not
broken open still leaks, in patches a hand across, and what a patch that size
lands on is one blade and not its neighbour. `sunFleckwork` is that — a third of
the ground, at half a pool's strength, and Grass.tsx turns it into a per-blade
decision so a third of the blades standing in one take it and the rest do not.
It lands on the lower part of a blade rather than its tip, because that is what
"through the canopy" means, and that single fact is what makes the same field
read differently from the two cameras: the hero is looking at the tops of the
canopy and sees almost none of it, and the soil act is looking through the
canopy at its shaded inside, where all of it is. Range, rather than exposure —
the difference between a frame with lit blades crossing dark ones and a frame
brought up a stop, which is a wall.

**And the dark end is a multiply, not a stop.** A ramp of colour has a floor: the
darkest blade in a field planted from `deep` is still a green you can read, so
the histogram had a hard bottom a long way above black and the field came out
evenly dim rather than as a dark photograph. Every blade is rolled a `shade` at
plant time — nine in a hundred under half, two or three of those under a quarter,
the rest untouched — which is worth a tenth off the mean and most of the frame's
range. Light fills it back in, because a blade in the sun is in the sun whatever
was over it a moment ago.

**Where that pool is placed is a legibility decision, not an aesthetic one.**
The wordmark, tagline and body copy sit dead centre in the hero with no scrim
under them, and near-white type over the lit end of this ramp fails contrast
outright. In the reference photograph the bright patch is above and to the left
of where a title would go, which is exactly why that photograph can carry one.
So the pool enters at the left edge, crosses the upper third and leaves through
the top of the frame — and it is deliberately not symmetrical about its own
axis: it spreads on the side away from the copy, is cut short on the side toward
it, and tapers along its length so it is broad where the frame's left margin is
empty and pinched where the eyebrow comes out to meet it. Sun through a broken
canopy has no reason to be symmetrical about anything. `scripts/hero-measure.mjs`
is what settles it: it photographs the beat three times — as shipped, with every
glyph made transparent, and again — differences the first two to find exactly
which pixels sit under type, differences the first and third to throw away the
pixels the field's own animation moved, and reports the contrast ratio at every
one of them against the colour the glyph is *specified* as. Not the colour it
came out: half-covered edge pixels are a blend of ink and field, and taking
those at face value reports 2:1 for type that is perfectly legible.

**No pool on the plant.** It was the obvious next move and it was built,
measured and taken out. The flower is one of the few solid props that answer the
scene's actual lamps, so a patch of sun at its foot does not light the flower —
it lights the tussock hiding the flower, and the subject ends up darker than its
surround. And the last three acts are shot from *inside* that tussock, so the
patch is not a patch there, it is the whole frame with the step cards and the
FAQ laid over it. The flower already stands lit against a dark field, because
the field is dark. Both of those failures are failures of the light being
*underfoot*, which is why the second pool is held off the stem by a metre and
only reaches full strength half a metre past that, and why the fleckwork lands
under the canopy rather than on top of it: what those acts wanted was a subject
standing in shade against a lit field, not a subject in a spotlight.

**A stand of flowers grows where the light is.** The five wildflower species were
all planted and four of them were in no frame anybody sees: thirty stands
scattered evenly over a nine-metre disc is one stand every eight square metres,
of which the hero holds four or five, and a flower standing in the shade of this
field is a dark dot on dark grass. So stands are more numerous and smaller — the
number of colours a frame carries is the number of *stands* in it, not the number
of plants — and each one is offered ground and takes it in proportion to how much
light is standing there. That is where the flowers of a real meadow are, it is
where they can be seen, and because the pools are placed off the hero's own
framing it is where the camera is pointed, without the planting having to know
anything about the camera. A stand also carries three species rather than two,
with the second and third drawn with the first taken out of the pot: the two cool
ones stay a fifth of the planting, but they are a fifth spread through other
people's stands instead of the occasional whole stand of their own, which is both
what a meadow looks like and the difference between appearing in one frame and
appearing in all of them.

**The flower is shorter than the grass around it.** A plant standing proud of
the canopy is a thing in the background of the hero, and then the approach is
just a dolly toward something you have been looking at all along. Tucked under
the canopy line it is genuinely not there until the camera comes down into the
field and parts it.

**Bare earth belongs to the root flare, and nowhere else.** The ground shader
used to mix its warm soil stops across the whole floor, which gave every gap in
the canopy a brown cast — and a brown gap in a meadow reads as a bald patch
however dark it is. Away from the plant the floor is only the biome's two
ground greens, held well down, because the one thing it has to be is the shade
the canopy is casting on itself. If soil is visible anywhere except at the
plant's foot, that is a bug.

**The plant gets a shadow, not a light.** A soft dark disc sits a hand's width
behind it, square to the lens, through the middle three acts. The field is
deliberately dense and deliberately one colour, which is right for a meadow and
wrong for a subject standing in it: without this the bloom competes with several
hundred blades the same size and brightness on screen. It is the same trick as
the copy's backdrop — edgeless, present only where it is needed.

**The corridor beside the plant parts, it is not absent.** During the pan down
the stem the camera is ten centimetres off the soil, and one blade rooted in
front of the lens fills half the frame — that act read as three flat gradients
before anything was done about it. The first answer was to refuse to plant
inside a corridor along the camera's sight line, which worked and left a bald
stripe beside the flower in every other frame. Now the blades are planted, and
laid over by a rotation about their own roots for the beats that need it, on a
uniform read from the camera's own height (`src/three/parting.ts`). Grass
parting as the camera comes down through it is also better motivated than grass
that was never there.

**One source of truth per fact.** The eight labels in the bloom act are DOM
elements pinned to the tips of eight petals that only exist in the scene, so
both are laid out from `src/lib/flowerLayout.ts` and the labels are placed by
running the live camera over those same numbers. Act lengths live once, in
`LAYOUT` in `src/lib/journey.ts`: the DOM lays its blocks out at those heights
and the chapter a beat is read at is computed from them, so lengthening a
station moves its copy, its petal and the camera's dwell together.

**Nothing that has to be seen may start a keyframe at `opacity: 0`.** The
feature card is remounted every time the feature changes, so its entry
animation restarts from its first frame; on a machine slow enough to starve the
animation clock it sat at computed opacity 0 three seconds after it was due —
the whole bloom act's body copy, invisible. Entry animations here move and blur;
they do not fade.

**The pond is not covered evenly, and that is the whole design.** Three things
want the same pixels: a surface almost entirely under blossom, a legible
reflection of the boughs hanging over it, and clear water with koi under it.
Cover the pond evenly and there is no surface left to reflect in and no window
to see a fish through. So the blossom *rafts* — a slow drifting noise field over
the pond says how much belongs at each point, about seventy percent of it floe
and the rest open lane, and `src/three/FloatingPetals.tsx` moves every petal
down the gradient of *what is here minus what belongs here*. Real blossom on
real water does exactly this. It also happens to be the only way the older
behaviour survives the density: a cursor dragged through the pond leaves a hole,
the hole is below its own target, and it pulls from every side until it is
not — where an evenly packed field would have nowhere to refill from, because
every petal around the gap is as boxed in as the gap is empty. The lanes are the
reservoir. Measured with `scripts/pond-sweep.mjs`, a two-pass sweep takes the
strip from 42% blossom to 8% and it is back at 40% four and a half seconds
later, evenly, from all sides. It is one scatter, two blurs and one gradient
over a grid of a few hundred cells, so it costs the same at thirteen thousand
petals as at four hundred; what the count actually costs is fill rate.

**The reflection is a coverage function, not a second pass.** Nothing is above
this water except the haze and our own procedural canopy, and everything in that
canopy hugs one known plane — so a mirrored ray does not need a render target,
it needs to know how much of that plane is filled where it comes out.
`src/three/canopy.ts` summarises the tree as fourteen discs and eight lines laid
on the ceiling plane, and the water's fragment shader traces one ray into it.
Because the ray is bent by the wave normal *before* it is traced, the canopy
arrives in the water torn into streaks rather than slid about underneath it.
What it took to make that legible rather than merely present was not the
geometry, it was the value: the tree in the frame is read as a silhouette
against a darker pond, and its reflection has no silhouette to be read by, so it
is given back brighter than it is and with a floor under the Fresnel term that
does not depend on the angle. Same decision as the ripple's gain and the koi's
markings — this scene paints things at the value the frame can see them at.

**Blossom on the pond is pitched dark, and that is a legibility decision.** Once
the surface is half under petals rather than lightly scattered with them, the
blossom is the biggest colour in the hero and the copy sits on it with no scrim.
At the pink they were, `scripts/hero-measure.mjs` put a paragraph over the water
at 7:1 with its worst twentieth at 2.2:1 — the covering was legible and the
sentence on top of it was not. Pitched to a dusk rose, the same paragraph is
back at 11:1 and 4.3:1, and the pond is still visibly under blossom. It is the
same rule the canopy's autumn leaves are pitched by: hue, not light.

**Chapter-driven copy is `fixed`, not `sticky`.** A sticky box releases when its
container's bottom catches it, which for a block shorter than the viewport is
never, and for a long act is a third of the way in — the beat meant to land at
the bottom of a move ends up a screen and a half above the fold. Anything whose
position in the story is a chapter is positioned outside the flow.

**Nothing goes through React state per frame.** The document subscribes to one
shared rAF loop (`src/ui/useJourney.ts`) and writes straight to style.

**That loop, not the render loop, advances the journey.** The damped chapter is
stepped in `useJourney`'s tick and the scene reads the result. Stepping it
inside `useFrame` makes every word on the page a function of how fast the GPU is
drawing grass — measured at two frames a second, the copy sat two screens behind
the scroll. This way a scene that cannot keep up falls behind the copy instead
of dragging it along. For the same reason the loop is started once and never
stopped: shutting it down when the last subscriber leaves is tidy, and it dies
for good on any React remount ordering where the cancel lands after the restart.

**The nav aims at chapters, not at elements.** An anchor lands on a section's
top edge, which for these sections is a screenful before the thing the link is
named after — `#download` opens with a full viewport of spacer. `src/ui/
navTargets.ts` maps each href to the beat it means and animates there on rAF.
Not `scrollTo({behavior:'smooth'})`: writing the URL fragment cancels that
outright, so every link updated the address bar and went nowhere.

## Layout

```
src/lib/          journey (camera keys, act lengths), scroll (chapter model),
                  flowerLayout (shared with the DOM), biomes, pointer, copy
src/three/        Scene, Rig, Grass, Fronds, Heads, Litter, Ground, soil, Bank,
                  Water, koi, FloatingPetals, Flower, Ant, Drift, Motes, sway
src/ui/           the document: Hero, Approach, Features, Steps, FAQ, Download,
                  SiteNav, Footer, BiomePicker
scripts/shoot.mjs headless screenshots of the whole journey
scripts/walk.mjs  the seven beats the meadow's light was tuned against
scripts/hero-measure.mjs  contrast under the hero's type, and frame luminance
                          (`BIOME=pond` to measure a dressing other than the
                          default)
scripts/pool-preview.mjs  the pools of sun through any chapter's camera, in a
                          terminal
scripts/acts-measure.mjs  mean and percentile luminance of every act, which is
                          the question "does this frame have any range in it"
scripts/pond-probe.mjs    frame time, blossom coverage and type contrast on the
                          pond, in one pass
scripts/pond-sweep.mjs    drives the real cursor across the pond and counts the
                          blossom back into the lane it cleared
scripts/pond-crop.mjs     a magnified crop of a shot, for looking at a koi
scripts/pond-snap.sh      a private copy of the tree on its own port, for
                          measuring against while something else is editing
```

## Not done

- The download button and the footer's Resources/Legal links point at `#`.
- No newsletter form. The DOM site has one; there is no endpoint behind it here,
  and a signup that goes nowhere is worse than no signup.
- No OG image.
- The forest and the pond each add geometry the other biomes do not have
  (fronds and litter; water, koi and a silt bank), so switching to them rebuilds
  more than a palette. That is the point of them, but it is also the reason
  they cost more.
