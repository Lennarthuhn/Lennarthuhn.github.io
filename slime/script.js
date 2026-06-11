/**
 * ASMR Slime WebGL
 * Version 1.2 - Maximum Robustness
 */

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', { alpha: false, depth: false, antialias: false });

if (!gl) {
    alert('WebGL 2.0 wird nicht unterstützt.');
}

gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');
gl.getExtension('OES_texture_half_float_linear');

const config = {
    SIM_RES: 128,
    DYE_RES: 512,
    DENSITY_DISSIPATION: 0.98,
    VELOCITY_DISSIPATION: 0.99,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    SPLAT_RADIUS: 0.005, // Verdoppelt
    SLIME_COLOR: { r: 0.2, g: 0.9, b: 0.4 }
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
    return p;
}

const splatProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uTarget; uniform float uAspect; uniform vec2 uPoint; uniform vec3 uColor; uniform float uRadius; in vec2 vUv; out vec4 outColor; void main() { vec2 p = vUv - uPoint; p.x *= uAspect; float s = exp(-dot(p, p) / uRadius); vec3 b = texture(uTarget, vUv).xyz; outColor = vec4(b + s * uColor, 1.0); }');
const advectProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 uTexelSize; uniform float uDt; uniform float uDiss; in vec2 vUv; out vec4 outColor; void main() { vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize; outColor = uDiss * texture(uSource, coord); }');
const divProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0)).x; float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0)).x; float T = texture(uVelocity, vUv + vec2(0, uTexelSize.y)).y; float B = texture(uVelocity, vUv - vec2(0, uTexelSize.y)).y; outColor = vec4(0.5 * (R - L + T - B), 0, 0, 1.0); }');
const curlProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0)).y; float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0)).y; float T = texture(uVelocity, vUv + vec2(0, uTexelSize.y)).x; float B = texture(uVelocity, vUv - vec2(0, uTexelSize.y)).x; outColor = vec4(0.5 * (R - L - T + B), 0, 0, 1.0); }');
const vortProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform vec2 uTexelSize; uniform float uDt; uniform float uCurlVal; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0)).x; float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0)).x; float T = texture(uCurl, vUv + vec2(0, uTexelSize.y)).x; float B = texture(uCurl, vUv - vec2(0, uTexelSize.y)).x; float C = texture(uCurl, vUv).x; vec2 f = 0.5 * vec2(abs(T)-abs(B), abs(R)-abs(L)); f /= length(f) + 1e-5; f *= uCurlVal * C; vec2 v = texture(uVelocity, vUv).xy; outColor = vec4(v + f * uDt, 0, 1.0); }');
const pressProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uPressure; uniform sampler2D uDiv; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0)).x; float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0)).x; float T = texture(uPressure, vUv + vec2(0, uTexelSize.y)).x; float B = texture(uPressure, vUv - vec2(0, uTexelSize.y)).x; float d = texture(uDiv, vUv).x; outColor = vec4((L + R + B + T - d) * 0.25, 0, 0, 1.0); }');
const gradProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uPressure; uniform sampler2D uVelocity; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; void main() { float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0)).x; float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0)).x; float T = texture(uPressure, vUv + vec2(0, uTexelSize.y)).x; float B = texture(uPressure, vUv - vec2(0, uTexelSize.y)).x; vec2 v = texture(uVelocity, vUv).xy; outColor = vec4(v - vec2(R - L, T - B) * 0.5, 0, 1.0); }');
const renderProg = createProgram(gl, baseVertexShader, '#version 300 es\nprecision highp float; uniform sampler2D uDye; uniform vec2 uTexelSize; in vec2 vUv; out vec4 outColor; float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); } void main() { vec3 c = texture(uDye, vUv).rgb; float den = length(c); float n = hash(vUv * 500.0); float L = length(texture(uDye, vUv - vec2(uTexelSize.x, 0)).rgb); float R = length(texture(uDye, vUv + vec2(uTexelSize.x, 0)).rgb); float T = length(texture(uDye, vUv + vec2(0, uTexelSize.y)).rgb); float B = length(texture(uDye, vUv - vec2(0, uTexelSize.y)).rgb); vec3 norm = normalize(vec3(L-R + (n-0.5)*0.02, B-T + (n-0.5)*0.02, 0.1)); float diff = max(dot(norm, normalize(vec3(0.5, 0.5, 1.0))), 0.0); float spec = pow(max(dot(vec3(0,0,1), reflect(normalize(vec3(-0.5,-0.5,-1)), norm)), 0.0), 64.0); vec3 final = c*(diff+0.3) + spec*0.8 + c*0.5 + smoothstep(0.98,1.0,n)*den*0.5; outColor = vec4(final, 1.0); }');

function createFBO(w, h, internalFormat, format, type, filter) {
    gl.activeTexture(gl.TEXTURE0); const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return createFBO(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter);
    return { tex, fbo, width: w, height: h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
}
function createDoubleFBO(w, h, i, f, t, l) {
    let f1 = createFBO(w, h, i, f, t, l), f2 = createFBO(w, h, i, f, t, l);
    return { get read() { return f1; }, get write() { return f2; }, swap() { [f1, f2] = [f2, f1]; } };
}

let density, velocity, pressure, divergence, curl;
function initFBOs() {
    const s = config.SIM_RES, d = config.DYE_RES, h = gl.HALF_FLOAT;
    density = createDoubleFBO(d, d, gl.RGBA16F, gl.RGBA, h, gl.LINEAR);
    velocity = createDoubleFBO(s, s, gl.RGBA16F, gl.RGBA, h, gl.LINEAR);
    pressure = createDoubleFBO(s, s, gl.RGBA16F, gl.RGBA, h, gl.NEAREST);
    divergence = createFBO(s, s, gl.RGBA16F, gl.RGBA, h, gl.NEAREST);
    curl = createFBO(s, s, gl.RGBA16F, gl.RGBA, h, gl.NEAREST);
}

const quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

let pointers = [{id:-1, x:0.5, y:0.5, dx:0, dy:0, down:false, moved:false, color:config.SLIME_COLOR}];

function Splat(x, y, dx, dy, color) {
    gl.bindVertexArray(quadVAO);
    gl.viewport(0, 0, velocity.width, velocity.height); gl.useProgram(splatProg);
    gl.uniform1i(gl.getUniformLocation(splatProg, 'uTarget'), velocity.read.attach(0));
    gl.uniform1f(gl.getUniformLocation(splatProg, 'uAspect'), canvas.width/canvas.height);
    gl.uniform2f(gl.getUniformLocation(splatProg, 'uPoint'), x, y);
    gl.uniform3f(gl.getUniformLocation(splatProg, 'uColor'), dx, dy, 0);
    gl.uniform1f(gl.getUniformLocation(splatProg, 'uRadius'), config.SPLAT_RADIUS);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();

    gl.viewport(0, 0, density.width, density.height);
    gl.uniform1i(gl.getUniformLocation(splatProg, 'uTarget'), density.read.attach(0));
    gl.uniform3f(gl.getUniformLocation(splatProg, 'uColor'), color.r, color.g, color.b);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();
}

function update() {
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    
    gl.bindVertexArray(quadVAO);
    gl.disable(gl.BLEND);

    // Vorticity
    gl.viewport(0, 0, curl.width, curl.height); gl.useProgram(curlProg);
    gl.uniform1i(gl.getUniformLocation(curlProg, 'uVelocity'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(curlProg, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, curl.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(vortProg);
    gl.uniform1i(gl.getUniformLocation(vortProg, 'uVelocity'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(vortProg, 'uCurl'), curl.attach(1));
    gl.uniform2f(gl.getUniformLocation(vortProg, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.uniform1f(gl.getUniformLocation(vortProg, 'uDt'), 0.016);
    gl.uniform1f(gl.getUniformLocation(vortProg, 'uCurlVal'), config.CURL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();

    // Advection
    gl.viewport(0, 0, velocity.width, velocity.height); gl.useProgram(advectProg);
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uVelocity'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uSource'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(advectProg, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.uniform1f(gl.getUniformLocation(advectProg, 'uDt'), 0.016);
    gl.uniform1f(gl.getUniformLocation(advectProg, 'uDiss'), config.VELOCITY_DISSIPATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();
    gl.viewport(0, 0, density.width, density.height);
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uSource'), density.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(advectProg, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.uniform1f(gl.getUniformLocation(advectProg, 'uDiss'), config.DENSITY_DISSIPATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();

    pointers.forEach(p => { if (p.moved) { Splat(p.x, p.y, p.dx, p.dy, p.color); p.moved = false; } });

    // Divergence
    gl.viewport(0, 0, divergence.width, divergence.height); gl.useProgram(divProg);
    gl.uniform1i(gl.getUniformLocation(divProg, 'uVelocity'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(divProg, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pressure
    gl.useProgram(pressProg);
    gl.uniform1i(gl.getUniformLocation(pressProg, 'uDiv'), divergence.attach(0));
    gl.uniform2f(gl.getUniformLocation(pressProg, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(gl.getUniformLocation(pressProg, 'uPressure'), pressure.read.attach(1));
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); pressure.swap();
    }
    gl.useProgram(gradProg);
    gl.uniform1i(gl.getUniformLocation(gradProg, 'uPressure'), pressure.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(gradProg, 'uVelocity'), velocity.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(gradProg, 'uTexelSize'), 1/velocity.width, 1/velocity.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();

    // Final Render
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.02, 0.02, 0.1, 1.0); // Dunkelblaues Test-Licht
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(renderProg);
    gl.uniform1i(gl.getUniformLocation(renderProg, 'uDye'), density.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(renderProg, 'uTexelSize'), 1/canvas.width, 1/canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(update);
}

function genColor() {
    const c = [{r:0.1,g:0.8,b:0.3}, {r:0.8,g:0.1,b:0.5}, {r:0.3,g:0.1,b:0.8}, {r:0.1,g:0.5,b:0.8}, {r:0.8,g:0.6,b:0.1}];
    return c[Math.floor(Math.random()*c.length)];
}

canvas.addEventListener('mousedown', e => { pointers[0].down = true; pointers[0].color = genColor(); });
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
        pointers[i].color = genColor();
    }
}, {passive:false});

initFBOs();
console.log("Simulation started successfully.");
requestAnimationFrame(update);
