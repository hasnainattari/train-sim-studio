import { createFileRoute } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rail Rush — 3D Subway Runner" },
      { name: "description", content: "A realistic 3D subway-style endless runner. Collect coins, dodge trains, jump barriers, slide under signs." },
    ],
  }),
  component: Page,
});

type ObType = "train" | "barrier" | "sign" | "coin";
type Ob = { id: number; lane: -1 | 0 | 1; z: number; type: ObType; length: number; collected?: boolean };

const LANE_X = 1.8;
const SPAWN_Z = -120;
const DESPAWN_Z = 8;

function Page() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [best, setBest] = useState(0);

  const stateRef = useRef({
    lane: 0 as -1 | 0 | 1,
    laneX: 0,
    y: 0,
    vy: 0,
    slide: 0,
    speed: 14,
    distance: 0,
    coins: 0,
    obstacles: [] as Ob[],
    spawnTimer: 0,
    nextId: 1,
    running: false,
    gameOver: false,
    // Jump physics
    grounded: true,
    coyote: 0,        // time since leaving ground where jump still allowed
    jumpBuffer: 0,    // buffered jump input if pressed just before landing
    jumpHeld: false,  // for variable jump height
    jumpsUsed: 0,     // for double jump
  });

  useEffect(() => {
    const b = localStorage.getItem("rail-rush-best");
    if (b) setBest(parseInt(b));
    const t = localStorage.getItem("rail-rush-theme") as "light" | "dark" | null;
    if (t) setTheme(t);
  }, []);
  useEffect(() => { localStorage.setItem("rail-rush-theme", theme); }, [theme]);

  const start = useCallback(() => {
    const s = stateRef.current;
    s.lane = 0; s.laneX = 0; s.y = 0; s.vy = 0; s.slide = 0;
    s.speed = 14; s.distance = 0; s.coins = 0;
    s.obstacles = []; s.spawnTimer = 0.5; s.running = true; s.gameOver = false;
    s.grounded = true; s.coyote = 0; s.jumpBuffer = 0; s.jumpHeld = false; s.jumpsUsed = 0;
    setScore(0); setCoins(0); setGameOver(false); setRunning(true);
  }, []);

  const move = useCallback((dir: -1 | 1) => {
    const s = stateRef.current;
    if (!s.running) return;
    s.lane = Math.max(-1, Math.min(1, s.lane + dir)) as -1 | 0 | 1;
  }, []);
  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    // Buffer the input; the physics step consumes it when grounded/coyote/double-jump allows
    s.jumpBuffer = 0.15;
    s.jumpHeld = true;
  }, []);
  const releaseJump = useCallback(() => {
    stateRef.current.jumpHeld = false;
  }, []);
  const slide = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    // Sliding while airborne slams you down for a fast landing
    if (s.y > 0.05) {
      s.vy = Math.min(s.vy, -14);
    }
    if (s.slide <= 0) s.slide = 0.7;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d") move(1);
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") { e.preventDefault(); jump(); }
      else if (e.key === "ArrowDown" || e.key === "s") slide();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") releaseJump();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [move, jump, releaseJump, slide]);

  // Swipe
  const touchStart = useRef<{x:number;y:number}|null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1);
    } else if (Math.abs(dy) > 30) {
      if (dy < 0) jump(); else slide();
    }
    touchStart.current = null;
  };

  const onEnd = useCallback((finalDist: number, finalCoins: number) => {
    setRunning(false); setGameOver(true);
    setScore(finalDist); setCoins(finalCoins);
    if (finalDist > best) { setBest(finalDist); localStorage.setItem("rail-rush-best", String(finalDist)); }
  }, [best]);

  const isDark = theme === "dark";

  return (
    <div className={isDark ? "dark" : ""}>
      <div
        className="relative h-screen w-screen overflow-hidden bg-background text-foreground"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 4.2, 7], fov: 55 }}>
          <Suspense fallback={null}>
            <Scene
              stateRef={stateRef}
              theme={theme}
              onScoreUpdate={(d, c) => { setScore(d); setCoins(c); }}
              onEnd={onEnd}
            />
          </Suspense>
        </Canvas>

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div className="pointer-events-auto rounded-2xl bg-card/85 backdrop-blur px-4 py-2 shadow-sm border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Distance</div>
            <div className="text-2xl font-bold tabular-nums leading-none">{score}<span className="text-sm font-medium text-muted-foreground">m</span></div>
            <div className="mt-1 text-[10px] text-muted-foreground">Best {best}m</div>
          </div>
          <div className="pointer-events-auto rounded-2xl bg-card/85 backdrop-blur px-4 py-2 shadow-sm border flex items-center gap-2">
            <span className="inline-block h-4 w-4 rounded-full bg-yellow-400 shadow-inner shadow-yellow-600" />
            <span className="text-xl font-bold tabular-nums">{coins}</span>
          </div>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="pointer-events-auto rounded-full bg-card/85 backdrop-blur border px-3 py-2 text-sm shadow-sm hover:bg-accent transition"
          >
            {isDark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>

        {running && (
          <>
            <div className="pointer-events-none absolute bottom-24 md:bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card/70 backdrop-blur border px-4 py-1.5 text-xs text-muted-foreground">
              ← → move · ↑ jump · ↓ slide · swipe on mobile
            </div>
            <div className="absolute bottom-6 inset-x-0 flex justify-center gap-3 md:hidden">
              <button onClick={() => move(-1)} className="pointer-events-auto h-14 w-14 rounded-full bg-card/85 backdrop-blur border text-xl shadow">←</button>
              <button onClick={jump} className="pointer-events-auto h-14 w-14 rounded-full bg-card/85 backdrop-blur border text-xl shadow">↑</button>
              <button onClick={slide} className="pointer-events-auto h-14 w-14 rounded-full bg-card/85 backdrop-blur border text-xl shadow">↓</button>
              <button onClick={() => move(1)} className="pointer-events-auto h-14 w-14 rounded-full bg-card/85 backdrop-blur border text-xl shadow">→</button>
            </div>
          </>
        )}

        {!running && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="max-w-md text-center rounded-3xl border bg-card/95 shadow-xl p-8 mx-4">
              <h1 className="text-4xl font-black tracking-tight">Rail Rush</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {gameOver ? "You crashed!" : "3D subway runner. Grab coins. Dodge trains."}
              </p>
              {gameOver && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Stat label="Score" value={`${score}m`} />
                  <Stat label="Coins" value={String(coins)} />
                  <Stat label="Best" value={`${best}m`} />
                </div>
              )}
              <button
                onClick={start}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition"
              >
                {gameOver ? "Play again" : "Start running"}
              </button>
              <div className="mt-4 text-[11px] text-muted-foreground">
                Arrows / WASD · Space to jump
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

// ============ 3D SCENE ============

function Scene({
  stateRef, theme, onScoreUpdate, onEnd,
}: {
  stateRef: React.MutableRefObject<any>;
  theme: "light" | "dark";
  onScoreUpdate: (d: number, c: number) => void;
  onEnd: (d: number, c: number) => void;
}) {
  const { scene } = useThree();
  const isDark = theme === "dark";

  useEffect(() => {
    const bg = isDark ? "#0a1628" : "#bfe0f2";
    scene.background = new THREE.Color(bg);
    scene.fog = new THREE.Fog(bg, 25, 90);
  }, [scene, isDark]);

  return (
    <>
      <hemisphereLight args={[isDark ? "#3a4a6a" : "#ffffff", isDark ? "#0a0a10" : "#8a7f6a", isDark ? 0.4 : 0.9]} />
      <directionalLight
        position={[8, 15, 6]}
        intensity={isDark ? 0.6 : 1.4}
        color={isDark ? "#a8c0ff" : "#fff4dc"}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <World stateRef={stateRef} theme={theme} onScoreUpdate={onScoreUpdate} onEnd={onEnd} />
    </>
  );
}

function World({
  stateRef, theme, onScoreUpdate, onEnd,
}: {
  stateRef: React.MutableRefObject<any>;
  theme: "light" | "dark";
  onScoreUpdate: (d: number, c: number) => void;
  onEnd: (d: number, c: number) => void;
}) {
  const isDark = theme === "dark";
  const groupRef = useRef<THREE.Group>(null!);
  const playerRef = useRef<THREE.Group>(null!);
  const [, force] = useState(0);
  const uiTimer = useRef(0);
  const runFrame = useRef(0);

  // Repeating track segments
  const segments = useMemo(() => Array.from({ length: 12 }, (_, i) => i * -12), []);
  const segRefs = useRef<THREE.Group[]>([]);

  // Clouds
  const clouds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    x: (Math.random() - 0.5) * 60,
    y: 10 + Math.random() * 6,
    z: -i * 10 - Math.random() * 20,
    s: 1 + Math.random() * 1.5,
  })), []);
  const cloudRefs = useRef<THREE.Group[]>([]);

  useFrame((_, dt) => {
    const s = stateRef.current;
    const clamped = Math.min(dt, 0.05);

    // Player smooth lane
    const targetX = s.lane * LANE_X;
    s.laneX += (targetX - s.laneX) * Math.min(1, clamped * 14);

    // Physics
    if (s.running) {
      s.distance += s.speed * clamped;
      s.speed = Math.min(30, s.speed + clamped * 0.2);
      s.vy -= 20 * clamped;
      s.y = Math.max(0, s.y + s.vy * clamped);
      if (s.y === 0) s.vy = 0;
      if (s.slide > 0) s.slide = Math.max(0, s.slide - clamped);
    }

    // Move segments toward camera
    segRefs.current.forEach((g) => {
      if (!g) return;
      if (s.running) g.position.z += s.speed * clamped;
      if (g.position.z > 6) g.position.z -= 12 * segments.length;
    });

    // Clouds drift
    cloudRefs.current.forEach((g) => {
      if (!g) return;
      if (s.running) g.position.z += s.speed * 0.3 * clamped;
      if (g.position.z > 15) g.position.z -= 140;
    });

    // Spawn
    if (s.running) {
      s.spawnTimer -= clamped;
      if (s.spawnTimer <= 0) {
        const r = Math.random();
        const lane = (Math.floor(Math.random() * 3) - 1) as -1 | 0 | 1;
        let type: ObType;
        if (r < 0.15) type = "train";
        else if (r < 0.4) type = "barrier";
        else if (r < 0.55) type = "sign";
        else type = "coin";

        // Don't stack trains close together
        if (type === "train") {
          const recent = s.obstacles.filter((o: Ob) => o.type === "train" && o.z < -70);
          if (recent.length >= 1) type = "coin";
        }

        const length = type === "train" ? 10 + Math.random() * 4 : type === "coin" ? 6 : 1;

        if (type === "coin") {
          // spawn a line of coins
          const baseZ = SPAWN_Z;
          for (let i = 0; i < 5; i++) {
            s.obstacles.push({ id: s.nextId++, lane, z: baseZ - i * 1.2, type: "coin", length: 0.5 });
          }
        } else {
          s.obstacles.push({ id: s.nextId++, lane, z: SPAWN_Z, type, length });
        }
        s.spawnTimer = type === "train" ? 2.0 + Math.random() * 1.2 : 0.8 + Math.random() * 0.8;
      }

      for (const o of s.obstacles) o.z += s.speed * clamped;

      // Collision detection
      const px = s.laneX;
      const py = s.y;
      for (const o of s.obstacles) {
        if (o.collected) continue;
        const ox = o.lane * LANE_X;
        if (Math.abs(ox - px) > 1.1 && o.type !== "coin") continue;
        // z range of object: from (o.z - o.length) back to o.z (front)
        const zBack = o.z - o.length;
        const zFront = o.z;
        const playerZ = 0;
        if (playerZ >= zBack - 0.4 && playerZ <= zFront + 0.4) {
          if (o.type === "coin") {
            if (Math.abs(ox - px) < 0.9 && Math.abs(o.z - playerZ) < 0.8 && py < 1.6) {
              o.collected = true;
              s.coins += 1;
            }
          } else if (o.type === "barrier") {
            if (Math.abs(ox - px) < 1.0 && py < 0.9) crash(s);
          } else if (o.type === "sign") {
            if (Math.abs(ox - px) < 1.0 && s.slide <= 0 && py < 1.3) crash(s);
          } else if (o.type === "train") {
            if (Math.abs(ox - px) < 1.0) crash(s);
          }
        }
      }

      // Remove far-behind
      s.obstacles = s.obstacles.filter((o: Ob) => o.z < DESPAWN_Z && !(o.collected && o.z > 2));

      if (s.gameOver) {
        onEnd(Math.floor(s.distance), s.coins);
        s.gameOver = false;
      }
    }

    // Player animation & pose
    if (playerRef.current) {
      playerRef.current.position.x = s.laneX;
      playerRef.current.position.y = s.y + (s.slide > 0 ? -0.3 : 0);
      playerRef.current.rotation.x = s.slide > 0 ? -0.5 : 0;
      playerRef.current.scale.y = s.slide > 0 ? 0.55 : 1;
      // Running arm/leg swing
      if (s.running) runFrame.current += clamped * s.speed * 0.7;
      const swing = Math.sin(runFrame.current * 2) * (s.y > 0.05 ? 0.3 : 1);
      const legL = playerRef.current.getObjectByName("legL") as THREE.Mesh | null;
      const legR = playerRef.current.getObjectByName("legR") as THREE.Mesh | null;
      const armL = playerRef.current.getObjectByName("armL") as THREE.Mesh | null;
      const armR = playerRef.current.getObjectByName("armR") as THREE.Mesh | null;
      if (legL && legR && armL && armR) {
        legL.rotation.x = swing * 0.9;
        legR.rotation.x = -swing * 0.9;
        armL.rotation.x = -swing * 0.9;
        armR.rotation.x = swing * 0.9;
      }
    }

    // HUD throttled
    uiTimer.current += clamped;
    if (uiTimer.current > 0.1) {
      uiTimer.current = 0;
      onScoreUpdate(Math.floor(s.distance), s.coins);
      force((x) => x + 1); // re-render obstacles list
    }
  });

  const s = stateRef.current;

  return (
    <group ref={groupRef}>
      {/* Sky dome color already via scene.background */}

      {/* Clouds */}
      {clouds.map((c, i) => (
        <group
          key={i}
          ref={(el) => { if (el) cloudRefs.current[i] = el; }}
          position={[c.x, c.y, c.z]}
          scale={c.s}
        >
          <Cloud dark={isDark} />
        </group>
      ))}

      {/* Distant buildings */}
      <Skyline dark={isDark} />

      {/* Track segments */}
      {segments.map((z, i) => (
        <group
          key={i}
          ref={(el) => { if (el) segRefs.current[i] = el; }}
          position={[0, 0, z]}
        >
          <TrackSegment dark={isDark} />
        </group>
      ))}

      {/* Obstacles */}
      {s.obstacles.map((o: Ob) => (
        <ObstacleMesh key={o.id} ob={o} dark={isDark} />
      ))}

      {/* Player */}
      <group ref={playerRef} position={[0, 0, 0]}>
        <Character dark={isDark} />
      </group>
    </group>
  );
}

function crash(s: any) {
  if (!s.running) return;
  s.running = false;
  s.gameOver = true;
}

// ============ 3D COMPONENTS ============

function Character({ dark }: { dark: boolean }) {
  const shirt = "#e63946";
  const pants = "#1a2a44";
  const skin = "#f2c9a4";
  const hair = "#2b1d14";
  const shoe = "#111";
  return (
    <group castShadow>
      {/* Legs */}
      <mesh name="legL" position={[-0.18, 0.45, 0]} castShadow>
        <boxGeometry args={[0.28, 0.9, 0.28]} />
        <meshStandardMaterial color={pants} />
      </mesh>
      <mesh name="legR" position={[0.18, 0.45, 0]} castShadow>
        <boxGeometry args={[0.28, 0.9, 0.28]} />
        <meshStandardMaterial color={pants} />
      </mesh>
      {/* Shoes */}
      <mesh position={[-0.18, 0.05, 0.08]} castShadow>
        <boxGeometry args={[0.32, 0.15, 0.5]} />
        <meshStandardMaterial color={shoe} />
      </mesh>
      <mesh position={[0.18, 0.05, 0.08]} castShadow>
        <boxGeometry args={[0.32, 0.15, 0.5]} />
        <meshStandardMaterial color={shoe} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.7, 0.85, 0.4]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      {/* Hood/backpack */}
      <mesh position={[0, 1.2, -0.28]} castShadow>
        <boxGeometry args={[0.55, 0.6, 0.25]} />
        <meshStandardMaterial color="#f4a01e" />
      </mesh>
      {/* Arms */}
      <mesh name="armL" position={[-0.48, 1.35, 0]} castShadow>
        <boxGeometry args={[0.22, 0.75, 0.22]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      <mesh name="armR" position={[0.48, 1.35, 0]} castShadow>
        <boxGeometry args={[0.22, 0.75, 0.22]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.85, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* Hair / cap */}
      <mesh position={[0, 2.13, -0.02]} castShadow>
        <boxGeometry args={[0.55, 0.15, 0.55]} />
        <meshStandardMaterial color={hair} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 1.88, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.02]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      <mesh position={[0.12, 1.88, 0.26]}>
        <boxGeometry args={[0.08, 0.08, 0.02]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
      <mesh position={[-0.12, 1.88, 0.27]}>
        <boxGeometry args={[0.04, 0.04, 0.02]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0.12, 1.88, 0.27]}>
        <boxGeometry args={[0.04, 0.04, 0.02]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}

function TrackSegment({ dark }: { dark: boolean }) {
  // 12 units long segment
  const ballastColor = dark ? "#2a251d" : "#8a8071";
  const groundColor = dark ? "#1a1a20" : "#b8ac8a";
  const tieColor = dark ? "#231a10" : "#5a4a34";
  const railColor = dark ? "#9a9080" : "#6b6357";
  const grassColor = dark ? "#12281a" : "#7ea15c";

  const ties = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 16; i++) arr.push(-i * 0.75);
    return arr;
  }, []);

  return (
    <group>
      {/* Grass sides */}
      <mesh position={[-8, -0.02, -6]} receiveShadow>
        <boxGeometry args={[10, 0.05, 12]} />
        <meshStandardMaterial color={grassColor} />
      </mesh>
      <mesh position={[8, -0.02, -6]} receiveShadow>
        <boxGeometry args={[10, 0.05, 12]} />
        <meshStandardMaterial color={grassColor} />
      </mesh>
      {/* Track base */}
      <mesh position={[0, -0.03, -6]} receiveShadow>
        <boxGeometry args={[6, 0.05, 12]} />
        <meshStandardMaterial color={ballastColor} />
      </mesh>
      {/* Lane dividers (subtle) */}
      <mesh position={[0, 0.001, -6]} receiveShadow>
        <boxGeometry args={[5.4, 0.001, 12]} />
        <meshStandardMaterial color={groundColor} />
      </mesh>

      {/* Ties */}
      {ties.map((z, i) => (
        <mesh key={i} position={[0, 0.02, z]} receiveShadow>
          <boxGeometry args={[5.4, 0.06, 0.35]} />
          <meshStandardMaterial color={tieColor} />
        </mesh>
      ))}

      {/* Rails - 3 lanes, 2 rails each */}
      {[-1, 0, 1].map((lane) => (
        <group key={lane} position={[lane * LANE_X, 0, 0]}>
          <mesh position={[-0.6, 0.08, -6]} castShadow>
            <boxGeometry args={[0.08, 0.1, 12]} />
            <meshStandardMaterial color={railColor} metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0.6, 0.08, -6]} castShadow>
            <boxGeometry args={[0.08, 0.1, 12]} />
            <meshStandardMaterial color={railColor} metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Side lampposts every segment */}
      <Lamp x={-4.5} dark={dark} />
      <Lamp x={4.5} dark={dark} />
    </group>
  );
}

function Lamp({ x, dark }: { x: number; dark: boolean }) {
  return (
    <group position={[x, 0, -6]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 3, 8]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      <mesh position={[Math.sign(-x) * 0.4, 3, 0]} castShadow>
        <boxGeometry args={[0.8, 0.1, 0.3]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      <mesh position={[Math.sign(-x) * 0.6, 2.9, 0]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial
          color={dark ? "#fff4b0" : "#fff8dc"}
          emissive={dark ? "#ffcc44" : "#000"}
          emissiveIntensity={dark ? 1 : 0}
        />
      </mesh>
    </group>
  );
}

function Cloud({ dark }: { dark: boolean }) {
  const color = dark ? "#3a4a68" : "#ffffff";
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1.4, 12, 12]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[1.2, 0.2, 0]}>
        <sphereGeometry args={[1.1, 12, 12]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[-1.2, 0.1, 0]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0.4, 0.7, 0.2]}>
        <sphereGeometry args={[0.9, 12, 12]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
    </group>
  );
}

function Skyline({ dark }: { dark: boolean }) {
  const buildings = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    x: (i - 20) * 4 + (Math.random() - 0.5) * 2,
    h: 3 + Math.random() * 8,
    w: 2 + Math.random() * 2,
    side: i % 2 === 0 ? -1 : 1,
  })), []);
  return (
    <group position={[0, 0, -80]}>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x + b.side * 12, b.h / 2, 0]}>
          <boxGeometry args={[b.w, b.h, 2]} />
          <meshStandardMaterial color={dark ? "#0e1a2c" : "#8fa3b8"} />
        </mesh>
      ))}
    </group>
  );
}

function ObstacleMesh({ ob, dark }: { ob: Ob; dark: boolean }) {
  const x = ob.lane * LANE_X;
  if (ob.collected) return null;

  if (ob.type === "train") {
    return (
      <group position={[x, 0, ob.z - ob.length / 2]}>
        {/* Body */}
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[1.4, 2.4, ob.length]} />
          <meshStandardMaterial color="#c94848" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Roof */}
        <mesh position={[0, 2.45, 0]} castShadow>
          <boxGeometry args={[1.5, 0.1, ob.length + 0.1]} />
          <meshStandardMaterial color="#7a2626" />
        </mesh>
        {/* Windows strip */}
        <mesh position={[0.71, 1.6, 0]}>
          <boxGeometry args={[0.02, 0.5, ob.length * 0.85]} />
          <meshStandardMaterial color={dark ? "#7ec8ff" : "#1a2a3a"} emissive={dark ? "#3a6a99" : "#000"} emissiveIntensity={dark ? 0.6 : 0} />
        </mesh>
        <mesh position={[-0.71, 1.6, 0]}>
          <boxGeometry args={[0.02, 0.5, ob.length * 0.85]} />
          <meshStandardMaterial color={dark ? "#7ec8ff" : "#1a2a3a"} emissive={dark ? "#3a6a99" : "#000"} emissiveIntensity={dark ? 0.6 : 0} />
        </mesh>
        {/* Front face */}
        <mesh position={[0, 1.2, ob.length / 2 + 0.01]}>
          <boxGeometry args={[1.35, 2.3, 0.05]} />
          <meshStandardMaterial color="#a03030" />
        </mesh>
        {/* Headlights */}
        <mesh position={[-0.4, 0.7, ob.length / 2 + 0.06]}>
          <sphereGeometry args={[0.12, 10, 10]} />
          <meshStandardMaterial color="#fff9c4" emissive="#ffee88" emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[0.4, 0.7, ob.length / 2 + 0.06]}>
          <sphereGeometry args={[0.12, 10, 10]} />
          <meshStandardMaterial color="#fff9c4" emissive="#ffee88" emissiveIntensity={1.5} />
        </mesh>
      </group>
    );
  }
  if (ob.type === "barrier") {
    return (
      <group position={[x, 0, ob.z]}>
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[1.4, 0.8, 0.4]} />
          <meshStandardMaterial color="#f4a01e" />
        </mesh>
        <mesh position={[0, 0.6, 0.01]}>
          <boxGeometry args={[1.42, 0.15, 0.42]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0, 0.2, 0.01]}>
          <boxGeometry args={[1.42, 0.15, 0.42]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>
    );
  }
  if (ob.type === "sign") {
    return (
      <group position={[x, 0, ob.z]}>
        <mesh position={[-0.7, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 2.4, 8]} />
          <meshStandardMaterial color="#5a5a5a" />
        </mesh>
        <mesh position={[0.7, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 2.4, 8]} />
          <meshStandardMaterial color="#5a5a5a" />
        </mesh>
        <mesh position={[0, 2.1, 0]} castShadow>
          <boxGeometry args={[1.6, 0.6, 0.12]} />
          <meshStandardMaterial color={dark ? "#e8ecf1" : "#2c3e50"} />
        </mesh>
      </group>
    );
  }
  // coin
  return (
    <group position={[x, 1.1, ob.z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.08, 16]} />
        <meshStandardMaterial color="#f7cf3d" emissive="#8a6a10" emissiveIntensity={0.3} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}
