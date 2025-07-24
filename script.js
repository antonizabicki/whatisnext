// === KLASA DO ANIMACJI LOGO (Z POPRAWKĄ BŁĘDU) ===
class LogoDistortionEffect {
    constructor(container, sourceDivId) {
        this.container = container;
        this.sourceDiv = document.querySelector(sourceDivId);
        this.config = {
            TEXTURE_RESOLUTION: 2048, distortionIntensity: 2.0, holdIntensity: 4.0, scale: 0.2, lerpFactor: 0.08
        };
        this.mouse = new THREE.Vector2(0, 0); this.targetMouse = new THREE.Vector2(0, 0); this.mouseVelocity = 0;
        this.targetVelocity = 0; this.isMouseDown = false;
    }

    async init(initialSvgPath) {
        try {
            await this.loadAndCreateTexture(initialSvgPath);
            this.setupScene(); this.createMesh(); this.addEventListeners(); this.animate();
        } catch (error) {
            console.error("!!! KRYTYCZNY BŁĄD INICJALIZACJI:", error); this.displayError(error.message);
        }
    }

    displayError(message) { this.container.innerHTML = `<div style="color: #c0392b; border: 2px solid #c0392b; background: #fbeae5; padding: 20px; max-width: 600px; text-align: left; font-family: monospace;"><h3>Wystąpił błąd!</h3><p><strong>Problem:</strong> ${message}</p></div>`; }

    // Ta funkcja teraz wczytuje plik SVG, przetwarza go i tworzy teksturę
    loadAndCreateTexture(svgPath) {
        return new Promise(async (resolve, reject) => {
            try {
                // Krok 1: Wczytaj plik SVG
                const response = await fetch(svgPath);
                if (!response.ok) throw new Error(`Nie udało się załadować pliku: ${svgPath}`);
                
                // ===============================================
                // === POPRAWIONA LINIA (TUTAJ BYŁ BŁĄD) ===
                // ===============================================
                const svgText = await response.text(); // Usunięto 'this.'
                
                this.sourceDiv.innerHTML = svgText;
                
                const svgClone = this.sourceDiv.querySelector('svg').cloneNode(true);
                const textElements = svgClone.querySelectorAll('text, tspan');
                textElements.forEach(el => el.remove());

                // ZMIANA KOLORU W ZALEŻNOŚCI OD TRYBU
                const fillColor = document.body.classList.contains('dark-mode') ? '#f0f1f3' : '#1a1a1a';
                const elementsToColor = svgClone.querySelectorAll('path, g, rect, circle');
                elementsToColor.forEach(el => el.setAttribute('fill', fillColor));
                
                const viewBox = svgClone.getAttribute('viewBox');
                if (!viewBox) throw new Error(`Plik ${svgPath} musi posiadać atrybut 'viewBox'!`);
                const parts = viewBox.split(' ').map(parseFloat);
                this.logoAspect = parts[2] / parts[3];
                
                let svgString = new XMLSerializer().serializeToString(svgClone);
                svgString = svgString.replace(/width=".*?"/g, '').replace(/height=".*?"/g, '');
                
                const img = new Image();
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const textureWidth = this.config.TEXTURE_RESOLUTION;
                    canvas.width = textureWidth; canvas.height = Math.round(textureWidth / this.logoAspect);
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    this.texture = new THREE.CanvasTexture(canvas);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = () => reject(new Error(`Nie udało się załadować ${svgPath} jako obrazka.`));
                img.src = url;
            } catch (error) { reject(error); }
        });
    }

    // Nowa funkcja do podmiany logo w locie
    async changeLogo(newSvgPath) {
        try {
            await this.loadAndCreateTexture(newSvgPath);
            this.material.uniforms.u_texture.value = this.texture;
            this.onResize();
        } catch (error) {
            console.error("Błąd podczas zmiany logo:", error);
            this.displayError(error.message);
        }
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
        this.camera.position.z = 2;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);
    }
    createMesh() {
        const distance = this.camera.position.z;
        const visibleHeight = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * distance;
        const visibleWidth = visibleHeight * this.camera.aspect;
        let planeWidth, planeHeight;
        if (visibleWidth / visibleHeight > this.logoAspect) {
            planeHeight = visibleHeight;
            planeWidth = visibleHeight * this.logoAspect;
        } else {
            planeWidth = visibleWidth;
            planeHeight = visibleWidth / this.logoAspect;
        }
        const scale = 0.8;
        this.geometry = new THREE.PlaneBufferGeometry(planeWidth * scale, planeHeight * scale, 64, 64);
        this.material = new THREE.ShaderMaterial({
            uniforms: { u_texture: { value: this.texture }, u_mouse: { value: this.mouse }, u_velocity: { value: 0 }, u_scale: { value: this.config.scale }, },
            vertexShader: `varying vec2 v_uv; void main() { v_uv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform sampler2D u_texture; uniform vec2 u_mouse; uniform float u_velocity; uniform float u_scale; varying vec2 v_uv; void main() { vec2 uv = v_uv; vec2 from_mouse = uv - u_mouse; float distance = length(from_mouse); float distortion_power = 1.0 - smoothstep(0.0, u_scale, distance); vec2 distorted_uv = uv + normalize(from_mouse) * distortion_power * u_velocity * 0.1; vec4 final_color = texture2D(u_texture, distorted_uv); if (final_color.a < 0.1) discard; gl_FragColor = final_color; }`,
            transparent: true
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
    }
    addEventListeners() {
        const cursorEl = document.querySelector('.custom-cursor');
        window.addEventListener('mousemove', e => {
            if (this.mesh) {
                const rect = this.renderer.domElement.getBoundingClientRect();
                this.targetMouse.set((e.clientX - rect.left) / rect.width, 1.0 - ((e.clientY - rect.top) / rect.height));
            }
            if (cursorEl) cursorEl.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
        });
        window.addEventListener('mousedown', () => this.isMouseDown = true);
        window.addEventListener('mouseup', () => this.isMouseDown = false);
        window.addEventListener('resize', () => this.onResize());
    }
    onResize() {
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.geometry) this.geometry.dispose();
        this.createMesh();
    }
    animate() {
        this.mouse.lerp(this.targetMouse, this.config.lerpFactor);
        const velocity = this.targetMouse.distanceTo(this.mouse);
        this.targetVelocity = this.isMouseDown ? this.config.holdIntensity : velocity * this.config.distortionIntensity;
        this.mouseVelocity += (this.targetVelocity - this.mouseVelocity) * this.config.lerpFactor;
        if (this.material) { this.material.uniforms.u_mouse.value = this.mouse; this.material.uniforms.u_velocity.value = this.mouseVelocity; }
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(() => this.animate());
    }
}

// === GŁÓWNA LOGIKA STRONY ===
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('dark-mode-toggle');
    const body = document.body;
    let logoEffect;

    const toggleDarkMode = () => {
        body.classList.toggle('dark-mode');
        const isDarkMode = body.classList.contains('dark-mode');
        if (isDarkMode) {
            localStorage.setItem('theme', 'dark');
            if(logoEffect) logoEffect.changeLogo('logo2.svg');
        } else {
            localStorage.setItem('theme', 'light');
            if(logoEffect) logoEffect.changeLogo('logo.svg');
        }
    };

    const savedTheme = localStorage.getItem('theme');
    const initialLogoPath = savedTheme === 'dark' ? 'logo2.svg' : 'logo.svg';
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
    }

    logoEffect = new LogoDistortionEffect(document.querySelector('#webgl-container'), '#logo-source');
    logoEffect.init(initialLogoPath);

    toggleButton.addEventListener('click', toggleDarkMode);

    const webglContainer = document.getElementById('webgl-container');
    window.addEventListener('scroll', () => {
        if (window.scrollY > window.innerHeight * 0.3) {
            webglContainer.classList.add('faded');
        } else {
            webglContainer.classList.remove('faded');
        }
    });
});