import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rail Runner — Endless Subway Dash" },
      { name: "description", content: "A realistic subway-style endless runner. Dodge trains, jump barriers, slide under signs." },
    ],
  }),
  component: Game,
});

type Obstacle = {
  lane: 0 | 1 | 2;
  z: number; // distance ahead
  type: "train" | "barrier" | "sign";
  length: number;
};

const LANES = [-1, 0, 1] as const;
const LANE_WIDTH = 1.6;
const HORIZON_Z = 90;
const CAM_HEIGHT = 2.4;
const FOCAL = 320;

function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const stateRef = useRef({
    lane: 1 as 0 | 1 | 2,
    laneX: 0,
    y: 0,
    vy: 0,
    sliding: 0,
    speed: 18,
    obstacles: [] as Obstacle[],
    spawnCooldown: 0,
    distance: 0,
    lastT: 0,
    running: false,
    theme: "light" as "light" | "dark",
    trackOffset: 0,
    tickerZ: [] as number[],
  });

  useEffect(() => {
    stateRef.current.theme = theme;
  }, [theme]);

  useEffect(() => {
    const v = localStorage.getItem("rail-runner-best");
    if (v) setBest(parseInt(v));
    const t = localStorage.getItem("rail-runner-theme") as "light" | "dark" | null;
    if (t) setTheme(t);
  }, []);

  useEffect(() => {
    localStorage.setItem("rail-runner-theme", theme);
  }, [theme]);

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.lane = 1;
    s.laneX = 0;
    s.y = 0;
    s.vy = 0;
    s.sliding = 0;
    s.speed = 18;
    s.obstacles = [];
    s.spawnCooldown = 1.2;
    s.distance = 0;
    s.trackOffset = 0;
    s.tickerZ = [];
    for (let i = 0; i < 40; i++) s.tickerZ.push((i / 40) * HORIZON_Z);
    setScore(0);
    setGameOver(false);
  }, []);

  const start = useCallback(() => {
    reset();
    setRunning(true);
    stateRef.current.running = true;
    stateRef.current.lastT = performance.now();
  }, [reset]);

  const move = useCallback((dir: -1 | 1) => {
    const s = stateRef.current;
    if (!s.running) return;
    s.lane = Math.max(0, Math.min(2, s.lane + dir)) as 0 | 1 | 2;
  }, []);
  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    if (s.y <= 0.01) s.vy = 9;
  }, []);
  const slide = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    if (s.sliding <= 0) s.sliding = 0.7;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d") move(1);
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") { e.preventDefault(); jump(); }
      else if (e.key === "ArrowDown" || e.key === "s") slide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, jump, slide]);

  // Touch swipe
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let sx = 0, sy = 0, active = false;
    const onStart = (e: TouchEvent) => {
      active = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1);
      } else {
        if (Math.abs(dy) > 30) {
          if (dy < 0) jump(); else slide();
        }
      }
    };
    canvas.addEventListener("touchstart", onStart, { passive: true });
    canvas.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [move, jump, slide]);

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const s = stateRef.current;
      const dt = Math.min(0.05, (t - s.lastT) / 1000);
      s.lastT = t;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // Palette
      const light = s.theme === "light";
      const pal = light
        ? {
            skyTop: "#cfe7f5", skyBot: "#f5efe1", ground: "#b8ac8a", groundFar: "#d9cfae",
            rail: "#6b6357", tie: "#5a4a34", ballast: "#8a8071",
            player: "#e63946", playerDark: "#a3172a", shadow: "rgba(0,0,0,0.25)",
            train: "#c94848", trainDark: "#7a2626", trainWin: "#1a2a3a",
            barrier: "#f4a01e", barrierDark: "#a86a0f",
            sign: "#2c3e50", signPost: "#5a5a5a",
            hud: "#1a1a1a", hudBg: "rgba(255,255,255,0.75)",
            lineMark: "#f2e6c9",
          }
        : {
            skyTop: "#0a1420", skyBot: "#1a2436", ground: "#2a2620", groundFar: "#151210",
            rail: "#9a9080", tie: "#3a2f22", ballast: "#3a342a",
            player: "#ff5a6e", playerDark: "#8a1e2e", shadow: "rgba(0,0,0,0.55)",
            train: "#d24a5a", trainDark: "#5a1a22", trainWin: "#7ec8ff",
            barrier: "#ffb845", barrierDark: "#8a5a12",
            sign: "#e8ecf1", signPost: "#7a7a7a",
            hud: "#f5f5f5", hudBg: "rgba(10,15,25,0.7)",
            lineMark: "#4a4230",
          };

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(1, pal.skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const horizonY = h * 0.45;

      // Ground
      const g = ctx.createLinearGradient(0, horizonY, 0, h);
      g.addColorStop(0, pal.groundFar);
      g.addColorStop(1, pal.ground);
      ctx.fillStyle = g;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Distant skyline
      ctx.fillStyle = light ? "#9fb4c4" : "#0f1826";
      const skylineOff = (s.distance * 0.5) % w;
      for (let i = -1; i < 12; i++) {
        const bx = i * 80 - skylineOff * 0.3;
        const bh = 20 + ((i * 37) % 40);
        ctx.fillRect(bx, horizonY - bh, 60, bh);
      }

      // Project 3D -> 2D
      const project = (x: number, y: number, z: number) => {
        const zz = z + 1;
        const scale = FOCAL / zz;
        const sxp = w / 2 + x * scale;
        const syp = horizonY + (CAM_HEIGHT - y) * scale;
        return { x: sxp, y: syp, scale };
      };

      if (s.running) {
        s.distance += s.speed * dt;
        s.speed = Math.min(38, s.speed + dt * 0.25);
        s.trackOffset = (s.trackOffset + s.speed * dt) % 4;
      }

      // Smooth lane
      const targetX = LANES[s.lane] * LANE_WIDTH;
      s.laneX += (targetX - s.laneX) * Math.min(1, dt * 14);

      // Physics
      if (s.running) {
        s.vy -= 22 * dt;
        s.y = Math.max(0, s.y + s.vy * dt);
        if (s.y === 0) s.vy = 0;
        if (s.sliding > 0) s.sliding = Math.max(0, s.sliding - dt);
      }

      // Rails / ties
      const drawTies = () => {
        ctx.fillStyle = pal.ballast;
        // ballast band
        for (let lane of LANES) {
          const zNear = 0.5, zFar = HORIZON_Z;
          const nearL = project((lane - 0.5) * LANE_WIDTH, 0, zNear);
          const nearR = project((lane + 0.5) * LANE_WIDTH, 0, zNear);
          const farL = project((lane - 0.5) * LANE_WIDTH, 0, zFar);
          const farR = project((lane + 0.5) * LANE_WIDTH, 0, zFar);
          ctx.beginPath();
          ctx.moveTo(nearL.x, nearL.y);
          ctx.lineTo(nearR.x, nearR.y);
          ctx.lineTo(farR.x, farR.y);
          ctx.lineTo(farL.x, farL.y);
          ctx.closePath();
          ctx.fill();
        }
        // ties
        for (let i = 0; i < 60; i++) {
          const z = i * 1.5 + (4 - s.trackOffset);
          if (z < 0.5 || z > HORIZON_Z) continue;
          for (let lane of LANES) {
            const l = project((lane - 0.45) * LANE_WIDTH, 0, z);
            const r = project((lane + 0.45) * LANE_WIDTH, 0, z);
            const thick = Math.max(1, 6 / (z + 1) * 4);
            ctx.fillStyle = pal.tie;
            ctx.fillRect(l.x, l.y - thick / 2, r.x - l.x, thick);
          }
        }
        // rails
        ctx.strokeStyle = pal.rail;
        for (let lane of LANES) {
          for (const off of [-0.35, 0.35]) {
            ctx.beginPath();
            for (let z = HORIZON_Z; z >= 0.5; z -= 1) {
              const p = project(lane * LANE_WIDTH + off, 0, z);
              const lw = Math.max(0.5, 3 / (z * 0.15 + 1));
              ctx.lineWidth = lw;
              if (z === HORIZON_Z) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
          }
        }
      };
      drawTies();

      // Spawn obstacles (fewer trains)
      if (s.running) {
        s.spawnCooldown -= dt;
        if (s.spawnCooldown <= 0) {
          const r = Math.random();
          const lane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
          let type: Obstacle["type"];
          // Fewer trains: 20%, barriers 50%, signs 30%
          if (r < 0.2) type = "train";
          else if (r < 0.7) type = "barrier";
          else type = "sign";
          const length = type === "train" ? 8 + Math.random() * 6 : 1;
          // Avoid two trains blocking all lanes: check last train
          const recentTrains = s.obstacles.filter(o => o.type === "train" && o.z > HORIZON_Z - 20);
          if (type === "train" && recentTrains.length >= 1) {
            type = "barrier";
          }
          s.obstacles.push({ lane, z: HORIZON_Z, type, length });
          s.spawnCooldown = type === "train" ? 2.2 + Math.random() * 1.5 : 1.0 + Math.random() * 1.2;
        }

        for (const o of s.obstacles) o.z -= s.speed * dt;
        s.obstacles = s.obstacles.filter(o => o.z + o.length > -2);

        // Collision
        for (const o of s.obstacles) {
          if (o.lane !== s.lane) continue;
          const nearZ = o.z;
          const farZ = o.z + o.length;
          if (nearZ < 1.2 && farZ > 0.2) {
            let hit = true;
            if (o.type === "barrier" && s.y > 0.9) hit = false;
            if (o.type === "sign" && s.sliding > 0) hit = false;
            if (hit) {
              s.running = false;
              setRunning(false);
              setGameOver(true);
              const finalScore = Math.floor(s.distance);
              setScore(finalScore);
              if (finalScore > best) {
                setBest(finalScore);
                localStorage.setItem("rail-runner-best", String(finalScore));
              }
            }
          }
        }
        setScore(Math.floor(s.distance));
      }

      // Draw obstacles (sorted far to near)
      const sorted = [...s.obstacles].sort((a, b) => b.z - a.z);
      for (const o of sorted) {
        const laneX = LANES[o.lane] * LANE_WIDTH;
        if (o.type === "train") {
          // Train body
          const zBack = o.z + o.length;
          const zFront = Math.max(0.3, o.z);
          const topY = 2.4;
          const halfW = 0.55;
          const p1 = project(laneX - halfW, topY, zFront);
          const p2 = project(laneX + halfW, topY, zFront);
          const p3 = project(laneX + halfW, 0, zFront);
          const p4 = project(laneX - halfW, 0, zFront);
          const b1 = project(laneX - halfW, topY, zBack);
          const b2 = project(laneX + halfW, topY, zBack);
          const b3 = project(laneX + halfW, 0, zBack);
          const b4 = project(laneX - halfW, 0, zBack);
          // Side
          ctx.fillStyle = pal.trainDark;
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y); ctx.lineTo(b2.x, b2.y);
          ctx.lineTo(b3.x, b3.y); ctx.lineTo(p3.x, p3.y);
          ctx.closePath(); ctx.fill();
          // Top
          ctx.fillStyle = pal.train;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y);
          ctx.closePath(); ctx.fill();
          // Front face
          ctx.fillStyle = pal.train;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
          ctx.closePath(); ctx.fill();
          // Windshield
          ctx.fillStyle = pal.trainWin;
          const wt = project(laneX - halfW * 0.7, topY * 0.85, zFront);
          const wb = project(laneX + halfW * 0.7, topY * 0.5, zFront);
          ctx.fillRect(wt.x, wt.y, wb.x - wt.x, wb.y - wt.y);
          // Headlights
          ctx.fillStyle = "#fff9c4";
          const hl = project(laneX - halfW * 0.5, 0.6, zFront);
          const hr = project(laneX + halfW * 0.5, 0.6, zFront);
          const hs = Math.max(2, 8 / (zFront + 1) * 3);
          ctx.beginPath(); ctx.arc(hl.x, hl.y, hs, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(hr.x, hr.y, hs, 0, Math.PI * 2); ctx.fill();
        } else if (o.type === "barrier") {
          const z = Math.max(0.3, o.z);
          const halfW = 0.55;
          const topY = 0.9;
          const p1 = project(laneX - halfW, topY, z);
          const p2 = project(laneX + halfW, topY, z);
          const p3 = project(laneX + halfW, 0, z);
          const p4 = project(laneX - halfW, 0, z);
          ctx.fillStyle = pal.barrier;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
          ctx.closePath(); ctx.fill();
          // stripes
          ctx.fillStyle = pal.barrierDark;
          const stripeH = (p3.y - p1.y) / 4;
          for (let i = 0; i < 4; i += 2) {
            ctx.fillRect(p1.x, p1.y + i * stripeH, p2.x - p1.x, stripeH);
          }
        } else {
          // sign (overhead — must slide)
          const z = Math.max(0.3, o.z);
          const halfW = 0.55;
          const yTop = 2.6;
          const yBot = 1.6;
          const p1 = project(laneX - halfW, yTop, z);
          const p2 = project(laneX + halfW, yTop, z);
          const p3 = project(laneX + halfW, yBot, z);
          const p4 = project(laneX - halfW, yBot, z);
          // posts
          ctx.strokeStyle = pal.signPost;
          ctx.lineWidth = Math.max(1, 4 / (z + 1) * 3);
          const post1t = project(laneX - halfW, yBot, z);
          const post1b = project(laneX - halfW, 0, z);
          const post2t = project(laneX + halfW, yBot, z);
          const post2b = project(laneX + halfW, 0, z);
          ctx.beginPath();
          ctx.moveTo(post1t.x, post1t.y); ctx.lineTo(post1b.x, post1b.y);
          ctx.moveTo(post2t.x, post2t.y); ctx.lineTo(post2b.x, post2b.y);
          ctx.stroke();
          // sign panel
          ctx.fillStyle = pal.sign;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
          ctx.closePath(); ctx.fill();
        }
      }

      // Player
      {
        const px = s.laneX;
        const pz = 0.9;
        const py = s.y;
        const sliding = s.sliding > 0;
        const hHeight = sliding ? 0.9 : 1.7;
        const halfW = 0.32;
        // shadow
        const shBase = project(px, 0, pz);
        const shR = project(px + halfW, 0, pz);
        ctx.fillStyle = pal.shadow;
        ctx.beginPath();
        ctx.ellipse(shBase.x, shBase.y + 4, (shR.x - shBase.x) * 1.1, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // body
        const t1 = project(px - halfW, py + hHeight, pz);
        const t2 = project(px + halfW, py + hHeight, pz);
        const b1 = project(px - halfW, py, pz);
        const b2 = project(px + halfW, py, pz);
        ctx.fillStyle = pal.player;
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y);
        ctx.closePath(); ctx.fill();
        // head
        if (!sliding) {
          const head = project(px, py + hHeight + 0.35, pz);
          const hr = (t2.x - t1.x) * 0.32;
          ctx.fillStyle = pal.playerDark;
          ctx.beginPath(); ctx.arc(head.x, head.y, hr, 0, Math.PI * 2); ctx.fill();
        }
      }

      // HUD overlay drawn via DOM
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [best]);

  return (
    <div className={`min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      <div className="relative min-h-screen bg-background text-foreground">
        <div className="absolute inset-0">
          <canvas ref={canvasRef} className="h-screen w-full block" />
        </div>

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div className="pointer-events-auto rounded-xl bg-card/80 backdrop-blur px-4 py-2 shadow-sm border">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Score</div>
            <div className="text-2xl font-bold tabular-nums">{score}m</div>
            <div className="text-[10px] text-muted-foreground">Best {best}m</div>
          </div>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="pointer-events-auto rounded-full bg-card/80 backdrop-blur border px-3 py-2 text-sm shadow-sm hover:bg-accent transition"
            aria-label="Toggle theme"
          >
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>

        {/* Controls hint */}
        {running && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card/70 backdrop-blur border px-4 py-1.5 text-xs text-muted-foreground">
            ← → move · ↑ jump · ↓ slide · (swipe on mobile)
          </div>
        )}

        {/* Mobile buttons */}
        {running && (
          <div className="absolute bottom-6 inset-x-0 flex justify-center gap-3 md:hidden">
            <button onClick={() => move(-1)} className="pointer-events-auto h-14 w-14 rounded-full bg-card/80 backdrop-blur border text-xl shadow">←</button>
            <button onClick={jump} className="pointer-events-auto h-14 w-14 rounded-full bg-card/80 backdrop-blur border text-xl shadow">↑</button>
            <button onClick={slide} className="pointer-events-auto h-14 w-14 rounded-full bg-card/80 backdrop-blur border text-xl shadow">↓</button>
            <button onClick={() => move(1)} className="pointer-events-auto h-14 w-14 rounded-full bg-card/80 backdrop-blur border text-xl shadow">→</button>
          </div>
        )}

        {/* Start / Game over overlay */}
        {!running && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
            <div className="max-w-md text-center rounded-2xl border bg-card/90 shadow-lg p-8 mx-4">
              <h1 className="text-3xl font-bold tracking-tight">Rail Runner</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {gameOver ? "You crashed!" : "Dodge trains. Jump barriers. Slide under signs."}
              </p>
              {gameOver && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted p-3">
                    <div className="text-xs text-muted-foreground">Score</div>
                    <div className="text-xl font-bold">{score}m</div>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <div className="text-xs text-muted-foreground">Best</div>
                    <div className="text-xl font-bold">{best}m</div>
                  </div>
                </div>
              )}
              <button
                onClick={start}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition"
              >
                {gameOver ? "Play again" : "Start running"}
              </button>
              <div className="mt-4 text-[11px] text-muted-foreground">
                Keys: ← → ↑ ↓ · Space to jump
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
