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
      return new THREE.TorusGeometry(
        p.radius ?? 1,
        p.tube ?? 0.3,
        p.radialSegments ?? 8,
        p.tubularSegments ?? 12
      );
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(p.radius ?? 0.5, p.detail ?? 0);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(p.radius ?? 0.5, p.detail ?? 0);
    case 'octahedron':
      return new THREE.OctahedronGeometry(p.radius ?? 0.5, p.detail ?? 0);
    case 'wedge':
      // THREE has no native wedge; use box as closest fallback
      return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1);
    case 'tri': {
      const a = p.a || [0, 0, 0];
      const b = p.b || [1, 0, 0];
      const c = p.c || [0, 1, 0];
      const d = p.d ?? 0;
      const geo = new THREE.BufferGeometry();
      if (d > 0) {
        // Extruded triangle prism
        const vertices = new Float32Array([
          ...a, ...b, ...c,
          a[0], a[1] + d, a[2],
          b[0], b[1] + d, b[2],
          c[0], c[1] + d, c[2],
        ]);
        // Simple prism faces (not fully indexed, but sufficient fallback)
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      } else {
        const vertices = new Float32Array([...a, ...b, ...c]);
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      }
      geo.computeVertexNormals();
      return geo;
    }
    case 'patch': {
      const verts = p.vertices || [];
      const d = p.d ?? 0;
      const geo = new THREE.BufferGeometry();
      const vertices = new Float32Array(verts);
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.computeVertexNormals();
      return geo;
    }
    default:
      console.warn(`[FallbackGeometry] Unknown type "${type}", using box fallback`);
      return new THREE.BoxGeometry(1, 1, 1);
  }
}
