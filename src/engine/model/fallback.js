import * as THREE from 'three';

/**
 * Fallback geometry builder when Voxel Runtime is unavailable.
 * Supports all primitive types used by exported models per API reference.
 */
export function fallbackBuildGeometry(type, params) {
  const p = params || {};
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1);
    case 'sphere':
      return new THREE.SphereGeometry(p.radius ?? 0.5, p.widthSegments ?? 16, p.heightSegments ?? 12);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        p.radiusTop ?? 0.5,
        p.radiusBottom ?? 0.5,
        p.height ?? 1,
        p.radialSegments ?? 16
      );
    case 'cone':
      return new THREE.ConeGeometry(p.radius ?? 0.5, p.height ?? 1, p.radialSegments ?? 16);
    case 'torus':
      {
        const geometry = new THREE.TorusGeometry(
        p.radius ?? 1,
        p.tube ?? 0.3,
        p.radialSegments ?? 8,
        p.tubularSegments ?? 12
        );
        geometry.rotateX(-Math.PI / 2);
        return geometry;
      }
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(p.radius ?? 0.5, p.detail ?? 0);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(p.radius ?? 0.5, p.detail ?? 0);
    case 'octahedron':
      return new THREE.OctahedronGeometry(p.radius ?? 0.5, p.detail ?? 0);
    case 'wedge':
      {
        const width = p.width ?? 1;
        const height = p.height ?? 1;
        const depth = p.depth ?? 1;
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, -height / 2);
        shape.lineTo(width / 2, -height / 2);
        shape.lineTo(-width / 2, height / 2);
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
          steps: 1,
          depth,
          bevelEnabled: false,
        });
        geometry.translate(0, 0, -depth / 2);
        geometry.computeVertexNormals();
        return geometry;
      }
    case 'tri': {
      const a = p.a || [0, 0, 0];
      const b = p.b || [1, 0, 0];
      const c = p.c || [0, 1, 0];
      const d = p.d ?? 0;
      const geo = new THREE.BufferGeometry();
      const vertices = d > 0
        ? _extrudeTriangle(a, b, c, d)
        : new Float32Array([...a, ...b, ...c]);
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.computeVertexNormals();
      return geo;
    }
    case 'patch': {
      const verts = p.vertices || [];
      const d = p.d ?? 0;
      const geo = new THREE.BufferGeometry();
      const output = [];
      for (let i = 0; i + 8 < verts.length; i += 9) {
        const a = verts.slice(i, i + 3);
        const b = verts.slice(i + 3, i + 6);
        const c = verts.slice(i + 6, i + 9);
        output.push(...(d > 0 ? _extrudeTriangle(a, b, c, d) : [...a, ...b, ...c]));
      }
      const vertices = new Float32Array(output);
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.computeVertexNormals();
      return geo;
    }
    default:
      console.warn(`[FallbackGeometry] Unknown type "${type}", using box fallback`);
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function _extrudeTriangle(a, b, c, thickness) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const vc = new THREE.Vector3(...c);
  const normal = new THREE.Vector3()
    .crossVectors(new THREE.Vector3().subVectors(vb, va), new THREE.Vector3().subVectors(vc, va))
    .normalize()
    .multiplyScalar(thickness / 2);
  const fa = va.clone().add(normal);
  const fb = vb.clone().add(normal);
  const fc = vc.clone().add(normal);
  const ba = va.clone().sub(normal);
  const bb = vb.clone().sub(normal);
  const bc = vc.clone().sub(normal);
  const triangle = (x, y, z) => [x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z];
  return new Float32Array([
    ...triangle(fa, fb, fc),
    ...triangle(ba, bc, bb),
    ...triangle(fa, ba, fb), ...triangle(fb, ba, bb),
    ...triangle(fb, bb, fc), ...triangle(fc, bb, bc),
    ...triangle(fc, bc, fa), ...triangle(fa, bc, ba),
  ]);
}
