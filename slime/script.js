/**
 * ASMR Slime WebGL
 * Version 1.1 - Enhanced Compatibility
 */

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false
});

if (!gl) {
    alert('WebGL 2.0 wird von deinem Browser nicht unterstützt.');
}

// Extensions
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');
gl.getExtension('OES_texture_half_float_linear');

const config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 0.97,
    VELOCITY_DISSIPATION: 0.98,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    SPLAT_RADIUS: 0.25,
    BACK_COLOR: { r: 5, g: 5, b: 5 },
    SLIME_COLOR: { r: 0.1, g: 0.8, b: 0.3 }
};

const baseVertexShader = '#version 300 es\nprecision highp float; layout(location = 0) in vec2 aPosition; out vec2 vUv; void main() { vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }';

function createShader(gl, type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
    return s;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource); const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    return p;
}

const splatProgram = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uTarget; uniform float uAspectRatio; uniform vec2 uPoint; uniform vec3 uColor; uniform float uRadius; in vec2 vUv; out vec4 outColor; void main() { vec2 p = vUv - uPoint; p.x *= uAspectRatio; float splat = exp(-dot(p, p) / uRadius); vec3 base = texture(uTarget, vUv).xyz; outColor = vec4(base + splat * uColor, 1.0); }');
const advectionProgram = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 uTexelSize; uniform float uDt; uniform float uDissipation; in vec2 vUv; out vec4 outColor; void main() { vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize; outColor = uDissipation * texture(uSource, coord); }');
const divergenceProgram = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x; float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x; float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y; float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y; outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); }');
const curlProgram = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y; float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y; float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x; float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x; outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0); }');
const vorticityProgram = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform vec2 uTexelSize; uniform float uDt; uniform float uCurlValue; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x; float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x; float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x; float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x; float C = texture(uCurl, vUv).x; vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); force /= length(force) + 0.0001; force *= uCurlValue * C; vec2 vel = texture(uVelocity, vUv).xy; outColor = vec4(vel + force * uDt, 0.0, 1.0); }');
const pressureProgram = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uPressure; uniform sampler2D uDivergence; in vec2 vUv; uniform vec2 uTexelSize; out vec4 outColor; void main() { float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x; float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x; float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x; float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x; float div = texture(uDivergence, vUv).x; outColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0); }');
const gradientSubtractProgram = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uPressure; uniform sampler2D uVelocity; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x; float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x; float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x; float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x; vec2 vel = texture(uVelocity, vUv).xy; outColor = vec4(vel - vec2(R - L, T - B) * 0.5, 0.0, 1.0); }');
const renderProgram = createProgram(gl, baseVertexShader, "#version 300 es\nprecision highp float; uniform sampler2D uDye; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); } void main() { vec3 color = texture(uDye, vUv).rgb; float den = length(color); float noise = hash(vUv * 500.0); float L = length(texture(uDye, vUv - vec2(uTexelSize.x, 0.0)).rgb); float R = length(texture(uDye, vUv + vec2(uTexelSize.x, 0.0)).rgb); float T = length(texture(uDye, vUv + vec2(0.0, uTexelSize.y)).rgb); float B = length(texture(uDye, vUv - vec2(0.0, uTexelSize.y)).rgb); vec3 n = normalize(vec3(L-R + (noise-0.5)*0.02, B-T + (noise-0.5)*0.02, 0.1)); float diff = max(dot(n, normalize(vec3(0.5, 0.5, 1.0))), 0.0); float spec = pow(max(dot(vec3(0,0,1), reflect(normalize(vec3(-0.5,-0.5,-1)), n)), 0.0), 64.0); outColor = vec4(color*(diff+0.3) + spec*0.8 + color*0.5 + smoothstep(0.98,1.0,noise)*den*0.5, smoothstep(0.0,0.05,den)); }");

function createFBO(w, h, internalFormat, format, type, filter) {
    gl.activeTexture(gl.TEXTURE0); const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { return createFBO(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter); }
    return { texture, fbo, width: w, height: h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
}

function createDoubleFBO(w, h, internalFormat, format, type, filter) {
    let f1 = createFBO(w, h, internalFormat, format, type, filter); let f2 = createFBO(w, h, internalFormat, format, type, filter);
    return { get read() { return f1; }, get write() { return f2; }, swap() { [f1, f2] = [f2, f1]; } };
}

let density, velocity, pressure, divergence, curl;
function initFBOs() {
    const sim = config.SIM_RESOLUTION, dye = config.DYE_RESOLUTION, half = gl.HALF_FLOAT;
    density = createDoubleFBO(dye, dye, gl.RGBA16F, gl.RGBA, half, gl.LINEAR);
    velocity = createDoubleFBO(sim, sim, gl.RGBA16F, gl.RGBA, half, gl.LINEAR);
    pressure = createDoubleFBO(sim, sim, gl.RGBA16F, gl.RGBA, half, gl.NEAREST);
    divergence = createFBO(sim, sim, gl.RGBA16F, gl.RGBA, half, gl.NEAREST);
    curl = createFBO(sim, sim, gl.RGBA16F, gl.RGBA, half, gl.NEAREST);
}

const quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

let pointers = [ {id:-1, x:0, y:0, dx:0, dy:0, down:false, moved:false, color:config.SLIME_COLOR} ];

function Splat(x, y, dx, dy, color) {
    gl.viewport(0, 0, velocity.width, velocity.height); gl.useProgram(splatProgram);
    gl.uniform1i(gl.getUniformLocation(splatProgram, 'uTarget'), velocity.read.attach(0));
    gl.uniform1f(gl.getUniformLocation(splatProgram, 'uAspectRatio'), canvas.width/canvas.height);
    gl.uniform2f(gl.getUniformLocation(splatProgram, 'uPoint'), x, y);
    gl.uniform3f(gl.getUniformLocation(splatProgram, 'uColor'), dx, dy, 0);
    gl.uniform1f(gl.getUniformLocation(splatProgram, 'uRadius'), 0.0025);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();
    gl.viewport(0, 0, density.width, density.height);
    gl.uniform1i(gl.getUniformLocation(splatProgram, 'uTarget'), density.read.attach(0));
    gl.uniform3f(gl.getUniformLocation(splatProgram, 'uColor'), color.r, color.g, color.b);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();
}

function update() {
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, curl.width, curl.height); gl.useProgram(curlProgram);
    gl.uniform1i(gl.getUniformLocation(curlProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(curlProgram, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, curl.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(vorticityProgram);
    gl.uniform1i(gl.getUniformLocation(vorticityProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(vorticityProgram, 'uCurl'), curl.attach(1));
    gl.uniform2f(gl.getUniformLocation(vorticityProgram, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.uniform1f(gl.getUniformLocation(vorticityProgram, 'uDt'), 0.016);
    gl.uniform1f(gl.getUniformLocation(vorticityProgram, 'uCurlValue'), 30);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();
    gl.viewport(0, 0, velocity.width, velocity.height); gl.useProgram(advectionProgram);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'uSource'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(advectionProgram, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'uDt'), 0.016);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'uDissipation'), 0.98);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();
    gl.viewport(0, 0, density.width, density.height);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'uSource'), density.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(advectionProgram, 'uTexelSize'), 1/density.width, 1/density.height);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'uDissipation'), 0.97);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();
    pointers.forEach(p => { if (p.moved) { Splat(p.x, p.y, p.dx, p.dy, p.color); p.moved = false; } });
    gl.viewport(0, 0, divergence.width, divergence.height); gl.useProgram(divergenceProgram);
    gl.uniform1i(gl.getUniformLocation(divergenceProgram, 'uVelocity'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(divergenceProgram, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(pressureProgram);
    gl.uniform1i(gl.getUniformLocation(pressureProgram, 'uDivergence'), divergence.attach(0));
    gl.uniform2f(gl.getUniformLocation(pressureProgram, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    for (let i = 0; i < 20; i++) {
        gl.uniform1i(gl.getUniformLocation(pressureProgram, 'uPressure'), pressure.read.attach(1));
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); pressure.swap();
    }
    gl.useProgram(gradientSubtractProgram);
    gl.uniform1i(gl.getUniformLocation(gradientSubtractProgram, 'uPressure'), pressure.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(gradientSubtractProgram, 'uVelocity'), velocity.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(gradientSubtractProgram, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();
    gl.viewport(0, 0, canvas.width, canvas.height); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(renderProgram);
    gl.uniform1i(gl.getUniformLocation(renderProgram, 'uDye'), density.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(renderProgram, 'uTexelSize'), 1/canvas.width, 1/canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); requestAnimationFrame(update);
}

function generateColor() {
    const c = [{r:0.1,g:0.8,b:0.3}, {r:0.8,g:0.1,b:0.5}, {r:0.3,g:0.1,b:0.8}, {r:0.1,g:0.5,b:0.8}, {r:0.8,g:0.6,b:0.1}];
    return c[Math.floor(Math.random()*c.length)];
}

window.addEventListener('mousedown', e => { pointers[0].down = true; pointers[0].x = e.clientX/canvas.width; pointers[0].y = 1-e.clientY/canvas.height; });
window.addEventListener('mousemove', e => {
    if (pointers[0].down) {
        let nx = e.clientX/canvas.width, ny = 1-e.clientY/canvas.height;
        pointers[0].dx = (nx-pointers[0].x)*5000; pointers[0].dy = (ny-pointers[0].y)*5000;
        pointers[0].x = nx; pointers[0].y = ny; pointers[0].moved = true;
    }
});
window.addEventListener('mouseup', () => pointers[0].down = false);
window.addEventListener('touchstart', e => {
    e.preventDefault();
    for (let i=0; i<e.targetTouches.length; i++) {
        if (!pointers[i]) pointers.push({id:-1, x:0, y:0, dx:0, dy:0, down:false, moved:false, color:config.SLIME_COLOR});
        pointers[i].id = e.targetTouches[i].identifier; pointers[i].down = true;
        pointers[i].x = e.targetTouches[i].clientX/canvas.width; pointers[i].y = 1-e.targetTouches[i].clientY/canvas.height;
        pointers[i].color = generateColor();
    }
}, {passive:false});

window.clearScreen = () => {
    gl.viewport(0,0,density.width,density.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.read.fbo); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo); gl.clear(gl.COLOR_BUFFER_BIT);
};
window.randomSplats = () => { for (let i=0; i<10; i++) Splat(Math.random(), Math.random(), (Math.random()-0.5)*2000, (Math.random()-0.5)*2000, generateColor()); };

initFBOs();
for (let i=0; i<15; i++) Splat(Math.random(), Math.random(), (Math.random()-0.5)*1000, (Math.random()-0.5)*1000, generateColor());
requestAnimationFrame(update);

console.log("Simulation started successfully.");
