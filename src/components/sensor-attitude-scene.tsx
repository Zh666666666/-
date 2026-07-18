"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import type { SensorSampleItem } from "@/lib/rehab";

type Props = {
  thigh: SensorSampleItem | null | undefined;
  shank: SensorSampleItem | null | undefined;
};

type SensorMeshes = {
  thigh: THREE.Group;
  shank: THREE.Group;
};

function radians(value: number | null | undefined) {
  return THREE.MathUtils.degToRad(typeof value === "number" ? value : 0);
}

function setAttitude(group: THREE.Group, sample: SensorSampleItem | null | undefined) {
  // Match the Android renderer and WIT convention: yaw(Z) -> pitch(Y) -> roll(X).
  group.rotation.set(radians(sample?.roll), radians(sample?.pitch), radians(sample?.yaw), "ZYX");
}

function createSensor(color: number, labelOffset: number) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.42, 1.1),
    new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.48 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xf4f7f9, metalness: 0.05, roughness: 0.7 }),
  );
  face.position.set(0, 0.25, labelOffset);
  group.add(face);
  group.add(new THREE.AxesHelper(1.45));
  return group;
}

export function SensorAttitudeScene({ thigh, shank }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const meshesRef = useRef<SensorMeshes | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d2438);
    scene.fog = new THREE.Fog(0x0d2438, 10, 20);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 4.2, 9.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

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
    floor.position.y = -1.45;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(18, 24, 0x4d7188, 0x294d63);
    grid.position.y = -1.43;
    scene.add(grid);

    const thighMesh = createSensor(0x12a37f, 0.08);
    thighMesh.position.x = -2.25;
    const shankMesh = createSensor(0x2f80c7, -0.08);
    shankMesh.position.x = 2.25;
    scene.add(thighMesh, shankMesh);
    meshesRef.current = { thigh: thighMesh, shank: shankMesh };

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const render = () => {
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      meshesRef.current = null;
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
    if (!meshesRef.current) return;
    setAttitude(meshesRef.current.thigh, thigh);
    setAttitude(meshesRef.current.shank, shank);
  }, [thigh, shank]);

  return (
    <section className="relative overflow-hidden border-y border-[#27485f] bg-[#0d2438]" aria-label="双传感器实时三维姿态">
      <div ref={hostRef} className="h-[330px] w-full md:h-[410px]" data-testid="sensor-attitude-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-5 pt-4 text-sm font-bold text-white md:px-12">
        <span>大腿传感器</span>
        <span>小腿传感器</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#081b2b]/90 px-5 py-3 text-center text-xs leading-5 text-slate-200">
        模型姿态直接使用与 App 回执一致的 Roll / Pitch / Yaw；移动与转动数值见下方实时数据。
      </div>
    </section>
  );
}
