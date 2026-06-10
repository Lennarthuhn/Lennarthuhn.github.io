/**
 * ASMR Slime WebGL
 * Basierend auf Navier-Stokes Fluid Simulation
 */

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', { alpha: true, depth: false, stencil: false, antialias: false });
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');
gl.getExtension('OES_texture_half_float_linear'); gl.getExtension('EXT_color_buffer_float');

if (!gl) {
    alert('WebGL 2.0 wird von deinem Browser nicht unterstützt.');
}

// Konfiguration
const config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 0.97,
    VELOCITY_DISSIPATION: 0.98,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    SPLAT_RADIUS: 0.25,
    VISCOSITY: 0.5,
    BACK_COLOR: { r: 5, g: 5, b: 5 },
    SLIME_COLOR: { r: 0.1, g: 0.8, b: 0.3 } // Neon Grün
};

// Shader Quellen
const baseVertexShader = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 aPosition;
    out vec2 vUv;
    void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const displayShader = `#version 300 es
    precision highp float;
    uniform sampler2D uTexture;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        outColor = texture(uTexture, vUv);
    }
`;

const splatShader = `#version 300 es
    precision highp float;
    uniform sampler2D uTarget;
    uniform float uAspectRatio;
    uniform vec2 uPoint;
    uniform vec3 uColor;
    uniform float uRadius;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        vec2 p = vUv - uPoint;
        p.x *= uAspectRatio;
        float splat = exp(-dot(p, p) / uRadius);
        vec3 base = texture(uTarget, vUv).xyz;
        outColor = vec4(base + splat * uColor, 1.0);
    }
`;

const advectionShader = `#version 300 es
    precision highp float;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 uTexelSize;
    uniform float uDt;
    uniform float uDissipation;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize;
        outColor = uDissipation * texture(uSource, coord);
    }
`;

const divergenceShader = `#version 300 es
    precision highp float;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
        float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
        float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
        float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
        float div = 0.5 * (R - L + T - B);
        outColor = vec4(div, 0.0, 0.0, 1.0);
    }
`;

const pressureShader = `#version 300 es
    precision highp float;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform vec2 uTexelSize;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
        float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
        float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
        float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
        float div = texture(uDivergence, vUv).x;
        float p = (L + R + B + T - div) * 0.25;
        outColor = vec4(p, 0.0, 0.0, 1.0);
    }
`;

const gradientSubtractShader = `#version 300 es
    precision highp float;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
        float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
        float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
        float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
        vec2 velocity = texture(uVelocity, vUv).xy;
        velocity -= vec2(R - L, T - B) * 0.5;
        outColor = vec4(velocity, 0.0, 1.0);
    }
`;

const curlShader = `#version 300 es
    precision highp float;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
        float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
        float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
        float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
        float curl = R - L - T + B;
        outColor = vec4(0.5 * curl, 0.0, 0.0, 1.0);
    }
`;

const vorticityShader = `#version 300 es
    precision highp float;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform vec2 uTexelSize;
    uniform float uDt;
    uniform float uCurlValue;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
        float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
        float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
        float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
        float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
        float C = texture(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= uCurlValue * C;
        vec2 velocity = texture(uVelocity, vUv).xy;
        outColor = vec4(velocity + force * uDt, 0.0, 1.0);
    }
`;

// ASMR Slime Render Shader (Normalen, Glanz, Bloom & Textur)
const slimeRenderShader = `#version 300 es
    precision highp float;
    uniform sampler2D uDye;
    uniform vec2 uTexelSize;
    in vec2 vUv;
    out vec4 outColor;

    // Einfache Pseudo-Noise Funktion für Textur
    float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    void main() {
        vec3 color = texture(uDye, vUv).rgb;
        float density = length(color);
        
        // Rauschen für "Bläschen" oder Partikel
        float noise = hash(vUv * 500.0);
        float bubbles = smoothstep(0.98, 1.0, noise) * density * 0.5;
        
        // Normalen aus Dichtegradienten berechnen
        float L = length(texture(uDye, vUv - vec2(uTexelSize.x, 0.0)).rgb);
        float R = length(texture(uDye, vUv + vec2(uTexelSize.x, 0.0)).rgb);
        float T = length(texture(uDye, vUv + vec2(0.0, uTexelSize.y)).rgb);
        float B = length(texture(uDye, vUv - vec2(0.0, uTexelSize.y)).rgb);
        
        // Normalen leicht durch Noise beeinflussen für mehr Textur
        vec3 normal = normalize(vec3(L - R + (noise - 0.5) * 0.02, B - T + (noise - 0.5) * 0.02, 0.1));
        
        // Beleuchtung
        vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
        float diff = max(dot(normal, lightDir), 0.0);
        
        // Specular (Glanz) - Sehr scharf für ASMR Look
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
        
        // "Bloom" / Glow Effekt direkt im Shader
        vec3 glow = color * 0.5;
        
        vec3 finalColor = color * (diff + 0.3) + vec3(spec * 0.8) + glow + vec3(bubbles);
        
        // Transparenz basierend auf Dichte
        float alpha = smoothstep(0.0, 0.05, density);
        
        outColor = vec4(finalColor, alpha);
    }
`;

// WebGL Utilities
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

// Programme erstellen
const splatProgram = createProgram(gl, baseVertexShader, splatShader);
const advectionProgram = createProgram(gl, baseVertexShader, advectionShader);
const divergenceProgram = createProgram(gl, baseVertexShader, divergenceShader);
const curlProgram = createProgram(gl, baseVertexShader, curlShader);
const vorticityProgram = createProgram(gl, baseVertexShader, vorticityShader);
const pressureProgram = createProgram(gl, baseVertexShader, pressureShader);
const gradientSubtractProgram = createProgram(gl, baseVertexShader, gradientSubtractShader);
const renderProgram = createProgram(gl, baseVertexShader, slimeRenderShader);

// FBO Management
function createFBO(w, h, internalFormat, format, type, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn('Framebuffer incomplete, falling back to RGBA8');
        return createFBO(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter);
    }

    return {
        texture,
        fbo,
        width: w,
        height: h,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO(w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);

    return {
        get read() { return fbo1; },
        get write() { return fbo2; },
        swap() {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    };
}

// Initialisierung der FBOs
let density, velocity, pressure, divergence, curl;

function initFramebuffers() {
    const simRes = config.SIM_RESOLUTION;
    const dyeRes = config.DYE_RESOLUTION;
    const texType = gl.HALF_FLOAT;

    density = createDoubleFBO(dyeRes, dyeRes, gl.RGBA16F, gl.RGBA, texType, gl.LINEAR);
    velocity = createDoubleFBO(simRes, simRes, gl.RG16F, gl.RG, texType, gl.LINEAR);
    pressure = createDoubleFBO(simRes, simRes, gl.R16F, gl.RED, texType, gl.NEAREST);
    divergence = createFBO(simRes, simRes, gl.R16F, gl.RED, texType, gl.NEAREST);
    curl = createFBO(simRes, simRes, gl.R16F, gl.RED, texType, gl.NEAREST);
}

// Quad für Rendering
const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// Interaction
let pointers = [];

class Pointer {
    constructor() {
        this.id = -1;
        this.x = 0;
        this.y = 0;
        this.dx = 0;
        this.dy = 0;
        this.down = false;
        this.moved = false;
        this.color = config.SLIME_COLOR;
    }
}
pointers.push(new Pointer());

function Splat(x, y, dx, dy, color) {
    gl.viewport(0, 0, velocity.width, velocity.height);
    gl.useProgram(splatProgram);
    gl.uniform1i(gl.getUniformLocation(splatProgram, 'uTarget'), velocity.read.attach(0));
    gl.uniform1f(gl.getUniformLocation(splatProgram, 'uAspectRatio'), canvas.width / canvas.height);
    gl.uniform2f(gl.getUniformLocation(splatProgram, 'uPoint'), x, y);
    gl.uniform3f(gl.getUniformLocation(splatProgram, 'uColor'), dx, dy, 0.0);
    gl.uniform1f(gl.getUniformLocation(splatProgram, 'uRadius'), config.SPLAT_RADIUS / 100.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    velocity.swap();

    gl.viewport(0, 0, density.width, density.height);
    gl.uniform1i(gl.getUniformLocation(splatProgram, 'uTarget'), density.read.attach(0));
    gl.uniform3f(gl.getUniformLocation(splatProgram, 'uColor'), color.r, color.g, color.b);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    density.swap();
}

function update() {
    resizeCanvas();
    
    const dt = 0.016; 
    
    gl.disable(gl.BLEND);

    // Vorticity
    gl.viewport(0, 0, curl.width, curl.height);
    gl.useProgram(curlProgram);
    gl.uniform1i(gl.getUniformLocation(curlProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(curlProgram, 'uTexelSize'), 1.0 / velocity.width, 1.0 / velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, curl.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(vorticityProgram);
    gl.uniform1i(gl.getUniformLocation(vorticityProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(vorticityProgram, 'uCurl'), curl.attach(1));
    gl.uniform2f(gl.getUniformLocation(vorticityProgram, 'uTexelSize'), 1.0 / velocity.width, 1.0 / velocity.height);
    gl.uniform1f(gl.getUniformLocation(vorticityProgram, 'uDt'), dt);
    gl.uniform1f(gl.getUniformLocation(vorticityProgram, 'uCurlValue'), config.CURL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    velocity.swap();

    // Advection
    gl.viewport(0, 0, velocity.width, velocity.height);
    gl.useProgram(advectionProgram);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'uSource'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(advectionProgram, 'uTexelSize'), 1.0 / velocity.width, 1.0 / velocity.height);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'uDt'), dt);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'uDissipation'), config.VELOCITY_DISSIPATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    velocity.swap();

    gl.viewport(0, 0, density.width, density.height);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'uSource'), density.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(advectionProgram, 'uTexelSize'), 1.0 / density.width, 1.0 / density.height);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'uDissipation'), config.DENSITY_DISSIPATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    density.swap();

    // Splats
    pointers.forEach(p => {
        if (p.moved) {
            Splat(p.x, p.y, p.dx, p.dy, p.color);
            p.moved = false;
        }
    });

    // Divergence
    gl.viewport(0, 0, divergence.width, divergence.height);
    gl.useProgram(divergenceProgram);
    gl.uniform1i(gl.getUniformLocation(divergenceProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(divergenceProgram, 'uTexelSize'), 1.0 / velocity.width, 1.0 / velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pressure
    gl.useProgram(pressureProgram);
    gl.uniform1i(gl.getUniformLocation(pressureProgram, 'uDivergence'), divergence.attach(0));
    gl.uniform2f(gl.getUniformLocation(pressureProgram, 'uTexelSize'), 1.0 / velocity.width, 1.0 / velocity.height);
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(gl.getUniformLocation(pressureProgram, 'uPressure'), pressure.read.attach(1));
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        pressure.swap();
    }

    // Gradient Subtract
    gl.useProgram(gradientSubtractProgram);
    gl.uniform1i(gl.getUniformLocation(gradientSubtractProgram, 'uPressure'), pressure.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(gradientSubtractProgram, 'uVelocity'), velocity.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(gradientSubtractProgram, 'uTexelSize'), 1.0 / velocity.width, 1.0 / velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    velocity.swap();

    // Render
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(renderProgram);
    gl.uniform1i(gl.getUniformLocation(renderProgram, 'uDye'), density.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(renderProgram, 'uTexelSize'), 1.0 / canvas.width, 1.0 / canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(update);
}

function resizeCanvas() {
    const displayWidth  = window.innerWidth;
    const displayHeight = window.innerHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
    }
}

// Input Handlers
function updatePointerDownData(p, id, x, y) {
    p.id = id;
    p.down = true;
    p.x = x / canvas.width;
    p.y = 1.0 - y / canvas.height;
    p.dx = 0;
    p.dy = 0;
    p.color = generateColor();
}

function updatePointerMoveData(p, x, y) {
    let newX = x / canvas.width;
    let newY = 1.0 - y / canvas.height;
    p.dx = (newX - p.x) * 5000;
    p.dy = (newY - p.y) * 5000;
    p.x = newX;
    p.y = newY;
    p.moved = true;
}

function generateColor() {
    // ASMR-typische Farben: Neon, Pastell, Perlmutt
    const colors = [
        { r: 0.1, g: 0.8, b: 0.3 }, // Grün
        { r: 0.8, g: 0.1, b: 0.5 }, // Pink
        { r: 0.3, g: 0.1, b: 0.8 }, // Violett
        { r: 0.1, g: 0.5, b: 0.8 }, // Blau
        { r: 0.8, g: 0.6, b: 0.1 }  // Gold/Gelb
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

window.addEventListener('mousedown', e => {
    updatePointerDownData(pointers[0], -1, e.clientX, e.clientY);
});

window.addEventListener('mousemove', e => {
    if (pointers[0].down)
        updatePointerMoveData(pointers[0], e.clientX, e.clientY);
});

window.addEventListener('mouseup', () => {
    pointers[0].down = false;
});

window.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        if (i >= pointers.length) pointers.push(new Pointer());
        updatePointerDownData(pointers[i], touches[i].identifier, touches[i].clientX, touches[i].clientY);
    }
}, {passive: false});

window.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        for (let j = 0; j < pointers.length; j++) {
            if (pointers[j].id === touches[i].identifier) {
                updatePointerMoveData(pointers[j], touches[i].clientX, touches[i].clientY);
            }
        }
    }
}, {passive: false});

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
        for (let j = 0; j < pointers.length; j++) {
            if (pointers[j].id === touches[i].identifier) {
                pointers[j].down = false;
            }
        }
    }
});

function clearScreen() {
    gl.viewport(0, 0, density.width, density.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.read.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
}

function randomSplats() {
    for (let i = 0; i < 10; i++) {
        const x = Math.random();
        const y = Math.random();
        const dx = (Math.random() - 0.5) * 2000;
        const dy = (Math.random() - 0.5) * 2000;
        Splat(x, y, dx, dy, generateColor());
    }
}

window.clearScreen = clearScreen;
window.randomSplats = randomSplats;

initFramebuffers();

// Initialer "Schleim-Regen" für ASMR Start
for (let i = 0; i < 15; i++) {
    const x = Math.random();
    const y = Math.random();
    const dx = (Math.random() - 0.5) * 1000;
    const dy = (Math.random() - 0.5) * 1000;
    Splat(x, y, dx, dy, generateColor());
}

requestAnimationFrame(update);
