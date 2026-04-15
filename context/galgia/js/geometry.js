// galgia/js/geometry.js

import * as THREE from 'three';
import { randFloat, randInt } from './utils.js';

// This module will handle creating abstract shapes and geometry using clusters of smaller geometries.

export class ClusterGeometry {
    constructor() {
        this.group = new THREE.Group();
    }

    // Example: Create a clustered asteroid-like shape
    createAsteroidCluster(position, scale = 1, numClusters = 10, clusterSizeMin = 0.1, clusterSizeMax = 0.3) {
        const baseGeometry = new THREE.IcosahedronGeometry(0.5 * scale, 1);
        const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        // this.group.add(baseMesh); // Optional: add a base shape for reference or as part of the cluster

        for (let i = 0; i < numClusters; i++) {
            const subClusterGeometry = new THREE.DodecahedronGeometry(randFloat(clusterSizeMin, clusterSizeMax) * scale, 0);
            const subClusterMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(randFloat(0.3, 0.7), randFloat(0.3, 0.7), randFloat(0.3, 0.7)),
                flatShading: true
            });
            const subClusterMesh = new THREE.Mesh(subClusterGeometry, subClusterMaterial);

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
