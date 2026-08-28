import * as THREE from "three";

/**
 * Punto del suelo al que mira la cámara.
 *
 * Lo escribe `CameraRig` y lo lee la luz direccional para centrar ahí su cámara de sombras.
 * Centrarla en la *posición* de la cámara (y no en su objetivo) dejaba media ciudad visible
 * fuera del mapa de sombras, y todo lo que caía fuera se dibujaba en sombra.
 */
export const viewTarget = new THREE.Vector3(32, 0, 32);
/** Distancia actual de la cámara: la extensión de la sombra se adapta al encuadre. */
export const viewState = { distance: 46 };
