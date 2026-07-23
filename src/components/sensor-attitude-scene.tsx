"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { SensorSampleItem } from "@/lib/rehab";

type Props = {
  thigh: SensorSampleItem | null | undefined;
  shank: SensorSampleItem | null | undefined;
};

type Placement = "thigh" | "shank";

type SensorMeshes = Record<Placement, THREE.Group>;

type SceneRuntime = {
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
};

type ConnectionState = Record<Placement, boolean>;

const offlineAfterMs = 2_000;

function radians(value: number | null | undefined) {
  return THREE.MathUtils.degToRad(typeof value === "number" ? value : 0);
}

function sampleTime(sample: SensorSampleItem | null | undefined) {
  if (!sample) return null;
  const parsed = Date.parse(sample.receivedAt ?? sample.recordedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAttitude(sample: SensorSampleItem | null | undefined) {
  return Boolean(
    sample
    && [sample.roll, sample.pitch, sample.yaw].every((value) => typeof value === "number" && Number.isFinite(value)),
  );
}

function setAttitude(group: THREE.Group, sample: SensorSampleItem) {
  // Match the Android renderer and WIT convention: yaw(Z) -> pitch(Y) -> roll(X).
  group.rotation.set(radians(sample.roll), radians(sample.pitch), radians(sample.yaw), "ZYX");
}

function createSensor(color: number, faceZ: number) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.44, 1.02),
    new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.48 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.08, 0.46),
    new THREE.MeshStandardMaterial({ color: 0xf4f7f9, metalness: 0.05, roughness: 0.7 }),
  );
  face.position.set(0, 0.26, faceZ);
  group.add(face);
  group.add(new THREE.AxesHelper(1.25));
  return group;
}

function statusClass(online: boolean) {
  return online
    ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100"
    : "border-slate-400/40 bg-slate-950/45 text-slate-200";
}

export function SensorAttitudeScene({ thigh, shank }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const meshesRef = useRef<SensorMeshes | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const lastSampleRef = useRef<Record<Placement, string | null>>({ thigh: null, shank: null });
  const latestRef = useRef({ thigh, shank });
  const [online, setOnline] = useState<ConnectionState>({ thigh: false, shank: false });
  const [webglReady, setWebglReady] = useState(true);

  useEffect(() => {
    latestRef.current = { thigh, shank };
  }, [thigh, shank]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d2438);
    scene.fog = new THREE.Fog(0x0d2438, 12, 24);

    const camera = new THREE.OrthographicCamera(-4.8, 4.8, 3.15, -3.15, 0.1, 100);
    camera.position.set(0, 4.7, 9.4);
    camera.lookAt(0, -0.15, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglReady(false);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe6f5ff, 0x17364c, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 10),
      new THREE.MeshStandardMaterial({ color: 0x15364d, roughness: 0.92 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.48;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(18, 24, 0x4d7188, 0x294d63);
    grid.position.y = -1.46;
    scene.add(grid);

    const thighAnchor = new THREE.Group();
    thighAnchor.position.set(-2.35, 0, 0);
    const thighMesh = createSensor(0x12a37f, 0.08);
    thighAnchor.add(thighMesh);

    const shankAnchor = new THREE.Group();
    shankAnchor.position.set(2.35, 0, 0);
    const shankMesh = createSensor(0x2f80c7, -0.08);
    shankAnchor.add(shankMesh);
    scene.add(thighAnchor, shankAnchor);

    meshesRef.current = { thigh: thighMesh, shank: shankMesh };
    runtimeRef.current = { camera, renderer, scene };

    let resizeFrame = 0;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const width = Math.max(Math.round(host.getBoundingClientRect().width), 1);
        const height = Math.max(Math.round(host.getBoundingClientRect().height), 1);
        const aspect = width / height;
        const verticalHalf = 3.15;
        const horizontalHalf = Math.max(4.8, verticalHalf * aspect);

        camera.left = -horizontalHalf;
        camera.right = horizontalHalf;
        camera.top = verticalHalf;
        camera.bottom = -verticalHalf;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    return () => {
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      meshesRef.current = null;
      runtimeRef.current = null;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const update = (placement: Placement, sample: SensorSampleItem | null | undefined) => {
      const mesh = meshesRef.current?.[placement];
      if (!mesh || !sample || !hasAttitude(sample) || lastSampleRef.current[placement] === sample.id) return;
      setAttitude(mesh, sample);
      lastSampleRef.current[placement] = sample.id;
    };

    update("thigh", thigh);
    update("shank", shank);

    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.renderer.render(runtime.scene, runtime.camera);
    }
  }, [thigh, shank]);

  useEffect(() => {
    const updateConnectionState = () => {
      const now = Date.now();
      const next = {
        thigh: hasAttitude(latestRef.current.thigh)
          && sampleTime(latestRef.current.thigh) !== null
          && now - (sampleTime(latestRef.current.thigh) ?? 0) <= offlineAfterMs,
        shank: hasAttitude(latestRef.current.shank)
          && sampleTime(latestRef.current.shank) !== null
          && now - (sampleTime(latestRef.current.shank) ?? 0) <= offlineAfterMs,
      };
      setOnline((current) => current.thigh === next.thigh && current.shank === next.shank ? current : next);
    };

    updateConnectionState();
    const timer = window.setInterval(updateConnectionState, 250);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className="relative min-h-[340px] overflow-hidden border-y border-[#27485f] bg-[#0d2438] md:min-h-[420px]"
      aria-label="双传感器实时三维姿态"
    >
      <div
        ref={hostRef}
        className="absolute inset-0"
        data-testid="sensor-attitude-canvas"
      />
      {!webglReady ? (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-200">
          当前浏览器未能启动 3D 图形。原始姿态数据仍可在下方实时数据中核对。
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-2 gap-6 px-4 pt-4 text-sm font-bold text-white md:px-10">
        <div className="flex flex-col items-start gap-2">
          <span>大腿传感器</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(online.thigh)}`}>
            {online.thigh ? "实时" : "离线 · 保留最后姿态"}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span>小腿传感器</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(online.shank)}`}>
            {online.shank ? "实时" : "离线 · 保留最后姿态"}
          </span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#081b2b]/90 px-5 py-3 text-center text-xs leading-5 text-slate-200">
        姿态仅随 App 回传的 Roll / Pitch / Yaw 新帧更新；超过 2 秒无新帧时冻结，不生成补间动作。
      </div>
    </section>
  );
}
