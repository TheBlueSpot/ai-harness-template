// galgia/js/geometry.js

import * as THREE from 'https://esm.sh/three@0.163.0';
import { randFloat, randInt } from './utils.js';

// This module will handle creating abstract shapes and geometry using clusters of smaller geometries.

export class ClusterGeometry {
    constructor() {
        this.group = new THREE.Group();
    }

    createTargetCore(scale) {
        const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.11 * scale, 10, 10),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.95,
            }),
        );
        const halo = new THREE.Mesh(
            new THREE.RingGeometry(0.16 * scale, 0.3 * scale, 24),
            new THREE.MeshBasicMaterial({
                color: 0xb9ecff,
                transparent: true,
                opacity: 0.72,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        );
        halo.position.z = 0.08 * scale;

        const coreGroup = new THREE.Group();
        coreGroup.add(core);
        coreGroup.add(halo);
        return coreGroup;
    }

    createReadabilityShell(color) {
        return new THREE.MeshBasicMaterial({
            color,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
        });
    }

    // Example: Create a clustered asteroid-like shape
    createAsteroidCluster(position, scale = 1, numClusters = 10, clusterSizeMin = 0.1, clusterSizeMax = 0.3) {
        const targetCore = this.createTargetCore(scale);
        this.group.add(targetCore);

        for (let i = 0; i < numClusters; i++) {
            const subClusterGeometry = new THREE.DodecahedronGeometry(randFloat(clusterSizeMin, clusterSizeMax) * scale, 0);
            const subClusterMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(randFloat(0.3, 0.7), randFloat(0.3, 0.7), randFloat(0.3, 0.7)),
                flatShading: true
            });
            const subClusterMesh = new THREE.Mesh(subClusterGeometry, subClusterMaterial);
            const shellMesh = new THREE.Mesh(
                subClusterGeometry.clone(),
                this.createReadabilityShell(0x9ad8ff),
            );

            subClusterMesh.position.set(
                randFloat(-1, 1) * scale * 0.7,
                randFloat(-1, 1) * scale * 0.7,
                randFloat(-1, 1) * scale * 0.7
            );
            subClusterMesh.rotation.set(
                randFloat(0, Math.PI * 2),
                randFloat(0, Math.PI * 2),
                randFloat(0, Math.PI * 2)
            );
            shellMesh.scale.setScalar(1.55);
            subClusterMesh.add(shellMesh);
            this.group.add(subClusterMesh);
        }

        this.group.position.copy(position);
        this.group.scale.set(scale, scale, scale);
        return this.group;
    }

    // Add more cluster geometry types as needed, e.g., for enemies or bullets.

    getMesh() {
        return this.group;
    }

    update(deltaTime) {
        // Example: simple rotation for the cluster
        this.group.rotation.x += 0.1 * deltaTime;
        this.group.rotation.y += 0.05 * deltaTime;
    }
}
