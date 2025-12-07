/**
 * Player3DRenderer Module
 * Rendu 3D des personnages avec Zdog (layer séparé)
 */

export class Player3DRenderer {
    constructor(mainCanvas, mainCtx) {
        this.mainCanvas = mainCanvas;
        this.mainCtx = mainCtx;
        
        // Map des joueurs 3D avec leurs canvas individuels
        this.players3D = new Map();
        
        // Calculer la taille réelle du personnage à partir du code original :
        // - Corps : PLAYER_RADIUS = 25px, donc diamètre = 50px
        // - Batte : longueur de 10 à 90px (80px de longueur totale)
        //   Main avec batte : position idle à 25px, peut aller jusqu'à 40 + 60 = 100px lors du smash
        //   Donc depuis le centre : 25 + 90 = 115px (idle), 100 + 90 = 190px (smash)
        // - Main arrière : -20px
        // - Arc swipe : rayon 70px, donc largeur = 140px
        // - Largeur totale nécessaire : max(190px (batte smash), 140px (arc swipe)) = 190px
        //   + marge de sécurité = 200px
        // - Hauteur : 50px (corps) + animations verticales (wind up -10px, float +10px) = ~70px
        //   + marge = 100px
        // Mais pour être sûr avec toutes les animations, on prend 200x200
        this.playerCanvasSize = 200;
    }

    resize(scale) {
        this.scale = scale;
        // Les canvas individuels des joueurs restent à taille fixe
    }

    // Créer ou récupérer un joueur 3D
    ensurePlayer3D(playerId, color, facing) {
        if (!this.players3D.has(playerId)) {
            const player3D = this.createPlayer3D(playerId, color, facing);
            this.players3D.set(playerId, player3D);
        } else {
            const player3D = this.players3D.get(playerId);
            if (player3D.facing !== facing) {
                this.updateFacing(player3D, facing);
                player3D.facing = facing;
            }
        }
        return this.players3D.get(playerId);
    }
    
    // Créer un canvas individuel pour un joueur
    createPlayerCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = this.playerCanvasSize;
        canvas.height = this.playerCanvasSize;
        return canvas;
    }

    createPlayer3D(playerId, color, facing) {
        // Créer un canvas individuel pour ce joueur
        const playerCanvas = this.createPlayerCanvas();
        
        // Créer une illustration Zdog pour ce joueur uniquement
        // Centrer l'illo sur le canvas pour que le personnage soit centré par défaut
        const illo = new Zdog.Illustration({
            element: playerCanvas,
            zoom: 1,
            dragRotate: false,
            rotate: { x: -Math.PI / 6, y: Math.PI / 4 }, // Vue isométrique
            translate: { x: this.playerCanvasSize / 2, y: this.playerCanvasSize / 2, z: 0 } // Centrer sur le canvas
        });
        
        // Groupe principal du joueur - CENTRÉ par défaut (0, 0, 0)
        const playerGroup = new Zdog.Group({
            addTo: illo,
            translate: { x: 0, y: 0, z: 0 } // Centré par défaut
        });

        // CORPS : Sphère principale
        const body = new Zdog.Ellipse({
            addTo: playerGroup,
            diameter: 50,
            stroke: 3,
            color: color,
            fill: true,
            translate: { z: 0 }
        });

        // YEUX : Deux ellipses sur la face avant
        const eyeLeft = new Zdog.Ellipse({
            addTo: playerGroup,
            diameter: 12,
            stroke: 2,
            color: '#fff',
            fill: true,
            translate: { x: -15, y: -5, z: 25 }
        });

        const eyeRight = new Zdog.Ellipse({
            addTo: playerGroup,
            diameter: 12,
            stroke: 2,
            color: '#fff',
            fill: true,
            translate: { x: 15, y: -5, z: 25 }
        });

        // MAINS : Deux ellipses
        const handLeft = new Zdog.Ellipse({
            addTo: playerGroup,
            diameter: 16,
            stroke: 2,
            color: color,
            fill: true,
            translate: { x: -20, y: 10, z: 0 }
        });

        const handRight = new Zdog.Ellipse({
            addTo: playerGroup,
            diameter: 16,
            stroke: 2,
            color: color,
            fill: true,
            translate: { x: 25, y: 10, z: 0 }
        });

        // BATTLE : Groupe pour la batte (peut tourner)
        const batGroup = new Zdog.Group({
            addTo: handRight,
            translate: { x: 0, y: 0, z: 0 }
        });

        // Manche de la batte
        const batHandle = new Zdog.Box({
            addTo: batGroup,
            width: 6,
            height: 6,
            depth: 15,
            color: '#eee',
            fill: true,
            translate: { x: 0, y: 0, z: 0 }
        });

        // Tête de la batte
        const batHead = new Zdog.Ellipse({
            addTo: batGroup,
            diameter: 20,
            stroke: 4,
            color: '#eee',
            fill: true,
            translate: { x: 0, y: 0, z: 45 }
        });

        return {
            canvas: playerCanvas,
            illo: illo,
            playerGroup,
            body,
            eyeLeft,
            eyeRight,
            handLeft,
            handRight,
            batGroup,
            batHandle,
            batHead,
            color: color,
            facing: facing
        };
    }

    // Mettre à jour un joueur
    updatePlayer(playerId, playerState, animState) {
        const player3D = this.ensurePlayer3D(playerId, playerState.color, playerState.facing || 1);
        
        // Le joueur est centré sur son canvas (0, 0)
        // L'illo est déjà centré sur le canvas dans createPlayer3D
        player3D.playerGroup.translate.x = 0;
        player3D.playerGroup.translate.y = 0;
        player3D.playerGroup.translate.z = 0;
        
        // Rotation
        if (animState && animState.rotation) {
            player3D.playerGroup.rotate.z = animState.rotation;
        } else {
            player3D.playerGroup.rotate.z = 0;
        }
        
        // Scale (squash & stretch)
        if (animState && animState.scaleX && animState.scaleY) {
            player3D.playerGroup.scale.x = animState.scaleX;
            player3D.playerGroup.scale.y = animState.scaleY;
            player3D.playerGroup.scale.z = 1;
        } else {
            player3D.playerGroup.scale.x = 1;
            player3D.playerGroup.scale.y = 1;
            player3D.playerGroup.scale.z = 1;
        }
        
        // Mettre à jour les mains selon l'animation
        if (animState && animState.handLeft && animState.handRight) {
            player3D.handLeft.translate.x = animState.handLeft.x;
            player3D.handLeft.translate.y = animState.handLeft.y;
            player3D.handLeft.translate.z = animState.handLeft.z || 0;
            
            player3D.handRight.translate.x = animState.handRight.x;
            player3D.handRight.translate.y = animState.handRight.y;
            player3D.handRight.translate.z = animState.handRight.z || 0;
        }
        
        // Mettre à jour la batte
        if (animState && animState.batAngle !== undefined) {
            player3D.batGroup.rotate.z = animState.batAngle;
        }
        
        // Mettre à jour les yeux (glissement horizontal pour rotation 3D)
        if (animState && animState.eyeLookX !== undefined && animState.eyeLookY !== undefined) {
            const lookX = animState.eyeLookX;
            const lookY = animState.eyeLookY;
            
            // Calculer la profondeur Z pour que les yeux restent sur la surface de la sphère
            const radius = 25;
            const eyeX = -15 + lookX * 0.3;
            const eyeY = -5 + lookY * 0.3;
            const eyeZ = Math.sqrt(Math.max(0, radius * radius - eyeX * eyeX - eyeY * eyeY));
            
            player3D.eyeLeft.translate.x = eyeX;
            player3D.eyeLeft.translate.y = eyeY;
            player3D.eyeLeft.translate.z = eyeZ;
            
            const eyeX2 = 15 + lookX * 0.3;
            const eyeZ2 = Math.sqrt(Math.max(0, radius * radius - eyeX2 * eyeX2 - eyeY * eyeY));
            
            player3D.eyeRight.translate.x = eyeX2;
            player3D.eyeRight.translate.y = eyeY;
            player3D.eyeRight.translate.z = eyeZ2;
        }
        
        // États visuels
        if (playerState.victoryStance) {
            player3D.body.color = '#ffd700';
            player3D.handLeft.color = '#ffd700';
            player3D.handRight.color = '#ffd700';
        } else {
            player3D.body.color = playerState.color;
            player3D.handLeft.color = playerState.color;
            player3D.handRight.color = playerState.color;
        }
        
        // Yeux stunned (spirale jaune)
        if (animState && animState.isStunned) {
            player3D.eyeLeft.color = '#ffff00';
            player3D.eyeRight.color = '#ffff00';
            player3D.eyeLeft.stroke = 4;
            player3D.eyeRight.stroke = 4;
        } else {
            player3D.eyeLeft.color = '#fff';
            player3D.eyeRight.color = '#fff';
            player3D.eyeLeft.stroke = 2;
            player3D.eyeRight.stroke = 2;
        }
        
        // Facing
        if (playerState.facing !== player3D.facing) {
            this.updateFacing(player3D, playerState.facing);
            player3D.facing = playerState.facing;
        }
    }

    // Mettre à jour facing (inverser positions des mains)
    updateFacing(player3D, facing) {
        if (facing === -1) {
            // Facing left : inverser les positions
            player3D.handLeft.translate.x = 20;
            player3D.handRight.translate.x = -25;
        } else {
            // Facing right : positions normales
            player3D.handLeft.translate.x = -20;
            player3D.handRight.translate.x = 25;
        }
    }

    // Rendre un joueur individuel sur son canvas, puis le dessiner sur le canvas principal
    renderPlayer(playerId, gameX, gameY) {
        const player3D = this.players3D.get(playerId);
        if (!player3D) return;
        
        // NETTOYER le canvas du joueur
        const ctx = player3D.canvas.getContext('2d');
        ctx.clearRect(0, 0, player3D.canvas.width, player3D.canvas.height);
        
        // Rendre Zdog sur le canvas du joueur
        player3D.illo.updateRenderGraph();
        
        // Dessiner l'image du joueur sur le canvas principal aux coordonnées du jeu
        // Le contexte principal est déjà transformé (setTransform appliqué)
        // On dessine centré sur la position du joueur
        const offsetX = gameX - this.playerCanvasSize / 2;
        const offsetY = gameY - this.playerCanvasSize / 2;
        this.mainCtx.drawImage(player3D.canvas, offsetX, offsetY);
    }

    // Nettoyer (supprimer un joueur)
    removePlayer(playerId) {
        if (this.players3D.has(playerId)) {
            const player3D = this.players3D.get(playerId);
            player3D.playerGroup.remove();
            this.players3D.delete(playerId);
        }
    }
}

