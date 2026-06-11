/** ASMR Slime WebGL - v1.4 8-bit Safety **/
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', { alpha: false, depth: false });
function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const vsSrc = '#version 300 es\nlayout(location=0) in vec2 p; out vec2 vUv; void main() { vUv=p*0.5+0.5; gl_Position=vec4(p,0,1); }';
function createProg(fs) {
    const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, vsSrc); gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return p;
}

const splatProg = createProg('#version 300 es\nprecision highp float; uniform sampler2D t; uniform float a; uniform vec2 p; uniform vec3 c; in vec2 vUv; out vec4 o; void main() { vec2 d = vUv - p; d.x *= a; float s = exp(-dot(d,d)/0.001); o = texture(t, vUv) + vec4(s*c, 0.0); }');
const advectProg = createProg('#version 300 es\nprecision highp float; uniform sampler2D uV; uniform sampler2D uS; uniform vec2 s; in vec2 vUv; out vec4 o; void main() { vec2 c = vUv - 0.016 * (texture(uV, vUv).xy - 0.5) * s; o = texture(uS, c) * 0.98; }');
const renderProg = createProg('#version 300 es\nprecision highp float; uniform sampler2D uD; in vec2 vUv; out vec4 o; void main() { vec3 c = texture(uD, vUv).rgb; o = vec4(c * 1.5 + vec3(0.05, 0.05, 0.1), 1.0); }');

function createFBO(w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
}
function createDoubleFBO(w, h) {
    let f1 = createFBO(w, h), f2 = createFBO(w, h);
    return { get read() { return f1; }, get write() { return f2; }, swap() { [f1, f2] = [f2, f1]; } };
}

const density = createDoubleFBO(512, 512), velocity = createDoubleFBO(128, 128);
const quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function splat(x, y, c) {
    gl.bindVertexArray(quadVAO); gl.useProgram(splatProg);
    gl.uniform1f(gl.getUniformLocation(splatProg, 'a'), canvas.width/canvas.height);
    gl.uniform2f(gl.getUniformLocation(splatProg, 'p'), x, y);
    gl.uniform3f(gl.getUniformLocation(splatProg, 'c'), c.r, c.g, c.b);
    gl.viewport(0, 0, 512, 512); gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
    gl.uniform1i(gl.getUniformLocation(splatProg, 't'), 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();
}

function update() {
    gl.bindVertexArray(quadVAO);
    gl.viewport(0, 0, 512, 512); gl.useProgram(advectProg);
    gl.uniform2f(gl.getUniformLocation(advectProg, 's'), 1/512, 1/512);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uV'), 0);
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uS'), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();

    gl.viewport(0, 0, canvas.width, canvas.height); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(renderProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
    gl.uniform1i(gl.getUniformLocation(renderProg, 'uD'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(update);
}
canvas.addEventListener('mousedown', e => splat(e.clientX/canvas.width, 1-e.clientY/canvas.height, {r:0.2,g:0.8,b:0.5}));
for(let i=0;i<20;i++) splat(Math.random(), Math.random(), {r:Math.random(),g:Math.random(),b:Math.random()});
requestAnimationFrame(update);
console.log('v1.4 active');
