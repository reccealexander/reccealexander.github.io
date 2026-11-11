import { sampleCamera, FLOWER } from "/Users/alexanderrecce/personal_site/petal-three/zz-journey.mjs";
import { Vector3, Matrix4, Quaternion, PerspectiveCamera } from "three";

const clamp = (v,a=0,b=1)=> v<a?a:v>b?b:v;
const anchor = new Vector3(FLOWER.x, FLOWER.height*0.62, FLOWER.z);

function run(aspectW, aspectH, label) {
  console.log(`\n--- ${label} (${aspectW}x${aspectH}) ---`);
  console.log("c      camDist  haloDepth  haloDist  coverH  coverW  alphaCtr  behindPlant  buggyVsRight(cm)");
  const cam = new PerspectiveCamera(42, aspectW/aspectH, 0.02, 60);
  for (let c = 1.45; c <= 4.35; c += 0.05) {
    const s = sampleCamera(c);
    cam.position.copy(s.pos);
    const aspect = aspectW/Math.max(1,aspectH);
    const range = cam.position.distanceTo(s.target);
    const closeUp = 1 - clamp((range-1.2)/1.4);
    const pullback = aspect < 1.45 ? 1 + (Math.min(1.45/Math.max(aspect,0.35),2.3)-1)*closeUp : 1;
    if (pullback > 1.001) cam.position.sub(s.target).multiplyScalar(pullback).add(s.target);
    cam.lookAt(s.target);
    cam.fov = s.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();

    const on = clamp((c-1.5)/0.35)*(1-clamp((c-3.75)/0.5))*0.72;
    // as shipped: direction from the world origin, not from the plant
    const buggy = cam.position.clone().normalize();
    const right = cam.position.clone().sub(anchor).normalize();
    const pB = anchor.clone().addScaledVector(buggy, -0.16);
    const pR = anchor.clone().addScaledVector(right, -0.16);

    const fwd = new Vector3(0,0,-1).applyQuaternion(cam.quaternion);
    const toH = pR.clone().sub(cam.position);
    const depth = toH.dot(fwd);
    const dist = toH.length();
    const halfH = depth*Math.tan(cam.fov*Math.PI/360);
    const halfW = halfH*aspect;
    const plantDepth = anchor.clone().sub(cam.position).dot(fwd);
    // radial distance of the frame corner from the disc centre, in disc radii
    const perp = Math.sqrt(Math.max(0, dist*dist - depth*depth));
    const rCorner = (Math.hypot(halfW, halfH) + perp)/0.62;
    console.log(
      `${c.toFixed(2)}  ${range.toFixed(3)}   ${depth.toFixed(3)}     ${dist.toFixed(3)}   ` +
      `${(0.62/halfH).toFixed(2)}   ${(0.62/halfW).toFixed(2)}   ${(on).toFixed(3)}    ` +
      `${(depth>plantDepth?"behind":"IN FRONT")}   ${(pB.distanceTo(pR)*100).toFixed(1)}  cornerR=${rCorner.toFixed(2)}`
    );
  }
}
run(1440,900,"desktop");
run(390,844,"portrait");
