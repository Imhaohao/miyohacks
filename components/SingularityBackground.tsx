"use client";

import { useEffect, useRef } from "react";

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.,1.); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform vec2  uMouse;
uniform vec2  uMouseSlow;
uniform float uTime;

float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2  hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),
             mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p){ float v=0., a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.+17.3; a*=0.5; } return v; }

const vec3 ARBOR_DEEP  = vec3(0.012, 0.024, 0.060);
const vec3 ARBOR_INK   = vec3(0.020, 0.040, 0.110);
const vec3 ARBOR_BLUE  = vec3(0.043, 0.361, 1.000);
const vec3 ARBOR_MIST  = vec3(0.620, 0.757, 1.000);
const vec3 ARBOR_FROST = vec3(0.859, 0.906, 0.996);

vec2 toAspect(vec2 uv){ return (uv-0.5)*vec2(uRes.x/uRes.y,1.0); }

float distSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa=p-a, ba=b-a;
  float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-5),0.,1.);
  return length(pa-ba*h);
}

vec2 particlePos(float fi, vec2 mSlow){
  vec2 seed = vec2(fi*0.137, fi*0.731);
  vec2 home = (hash22(seed) - 0.5) * vec2(uRes.x/uRes.y, 1.0) * 1.8;
  float t  = uTime * (0.08 + 0.10*hash11(fi));
  vec2 dr  = vec2(sin(t + fi*1.7), cos(t*0.83 + fi*0.9)) * 0.020;
  vec2 pos = home + dr;
  float d2m = distance(pos, mSlow);
  float pull = smoothstep(0.85, 0.0, d2m);
  pull = pow(pull, 1.8) * 0.28;
  return mix(pos, mSlow, pull);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p  = toAspect(uv);
  vec2 mSlow = toAspect(uMouseSlow);

  float bg = fbm(p*1.4 + uTime*0.04);
  vec3 col = mix(ARBOR_DEEP, ARBOR_INK, 0.6 + 0.4*bg);
  col *= 1.0 - 0.30*smoothstep(0.4, 1.4, length(p));

  const int N = 28;

  float glow = 0.0;
  for (int i = 0; i < N; i++){
    vec2 pos = particlePos(float(i), mSlow);
    float d  = distance(p, pos);
    float dt = 0.0008 / (d*d + 0.00012);
    float ha = 0.012  / (d + 0.012);
    glow += dt*0.6 + ha*0.05;
  }

  float bonds = 0.0;
  for (int i = 0; i < N; i++){
    vec2 a = particlePos(float(i), mSlow);
    for (int j = 0; j < N; j++){
      if (j <= i) continue;
      vec2 b = particlePos(float(j), mSlow);
      float d = distance(a, b);
      if (d > 0.28) continue;
      float ds = distSeg(p, a, b);
      float line = 0.0010 / (ds + 0.0010);
      float w = (1.0 - smoothstep(0.05, 0.28, d));
      bonds += line * w;
    }
  }

  col += ARBOR_BLUE  * glow * 0.45;
  col += ARBOR_MIST  * pow(glow, 1.5) * 0.55;
  col += ARBOR_FROST * pow(glow, 3.0) * 0.9;
  col += ARBOR_MIST  * bonds * 0.030;
  col += ARBOR_FROST * pow(bonds, 1.8) * 0.012;

  col += (hash12(gl_FragCoord.xy + uTime) - 0.5) * 0.010;
  col = col / (1.0 + col*0.75);
  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    const kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    console.error(
      `[SingularityBackground] ${kind} shader compile failed:`,
      log && log.length ? log : "(driver returned no log — likely a resource/limit failure)",
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function SingularityBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
      alpha: false,
    });
    if (!gl) {
      console.warn("[SingularityBackground] WebGL unavailable");
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[SingularityBackground] program link:", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }

    const loc = {
      aPos: gl.getAttribLocation(prog, "aPos"),
      uRes: gl.getUniformLocation(prog, "uRes"),
      uMouse: gl.getUniformLocation(prog, "uMouse"),
      uMouseSlow: gl.getUniformLocation(prog, "uMouseSlow"),
      uTime: gl.getUniformLocation(prog, "uTime"),
    };

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const state = {
      tx: 0.5,
      ty: 0.5,
      x: 0.5,
      y: 0.5,
      sx: 0.5,
      sy: 0.5,
      t0: performance.now(),
    };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, w, h);
    }
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      state.tx = e.clientX / window.innerWidth;
      state.ty = 1.0 - e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    let running = true;
    const onVis = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);

    function frame() {
      if (!running) return;
      const now = (performance.now() - state.t0) / 1000;
      state.x += (state.tx - state.x) * 0.18;
      state.y += (state.ty - state.y) * 0.18;
      state.sx += (state.tx - state.sx) * 0.035;
      state.sy += (state.ty - state.sy) * 0.035;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform2f(loc.uMouse, state.x, state.y);
      gl.uniform2f(loc.uMouseSlow, state.sx, state.sy);
      gl.uniform1f(loc.uTime, now);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const loseContext = gl.getExtension("WEBGL_lose_context");

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(quad);
      loseContext?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="home-singularity-canvas"
      aria-hidden
    />
  );
}
