/**
 * ASMR Slime WebGL - v1.3 Final
 */
const canvas = document.getElementById('canvas');
function resize() {
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}
resize();
window.addEventListener('resize', resize);

const gl = canvas.getContext('webgl2', { alpha: true, depth: false, antialias: false });
if (!gl) alert('WebGL2 missing');

gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');

const config = {
    SIM_RES: 128, DYE_RES: 512,
    D_DISS: 0.98, V_DISS: 0.99,
    P_ITER: 20, CURL: 30, RADIUS: 0.005
};

const vsSrc = '#version 300 es\nlayout(location=0) in vec2 p; out vec2 vUv; void main() { vUv=p*0.5+0.5; gl_Position=vec4(p,0,1); }';
function createProg(vs, fs) {
    const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, vs); gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
    return p;
}

const splatProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D t; uniform float a; uniform vec2 p; uniform vec3 c; uniform float r; in vec2 vUv; out vec4 o; void main() { vec2 d = vUv - p; d.x *= a; float s = exp(-dot(d,d)/r); o = vec4(texture(t, vUv).xyz + s*c, 1.0); }');
const advectProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D uV; uniform sampler2D uS; uniform vec2 s; uniform float dt; uniform float f; in vec2 vUv; out vec4 o; void main() { vec2 c = vUv - dt * texture(uV, vUv).xy * s; o = f * texture(uS, c); }');
const divProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D uV; uniform vec2 s; in vec2 vUv; out vec4 o; void main() { float L=texture(uV,vUv-vec2(s.x,0)).x; float R=texture(uV,vUv+vec2(s.x,0)).x; float T=texture(uV,vUv+vec2(0,s.y)).y; float B=texture(uV,vUv-vec2(0,s.y)).y; o=vec4(0.5*(R-L+T-B),0,0,1); }');
const curlProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D uV; uniform vec2 s; in vec2 vUv; out vec4 o; void main() { float L=texture(uV,vUv-vec2(s.x,0)).y; float R=texture(uV,vUv+vec2(s.x,0)).y; float T=texture(uV,vUv+vec2(0,s.y)).x; float B=texture(uV,vUv-vec2(0,s.y)).x; o=vec4(0.5*(R-L-T+B),0,0,1); }');
const vortProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D uV; uniform sampler2D uC; uniform vec2 s; uniform float dt; uniform float v; in vec2 vUv; out vec4 o; void main() { float L=texture(uC,vUv-vec2(s.x,0)).x; float R=texture(uC,vUv+vec2(s.x,0)).x; float T=texture(uC,vUv+vec2(0,s.y)).x; float B=texture(uC,vUv-vec2(0,s.y)).x; float C=texture(uC,vUv).x; vec2 f=0.5*vec2(abs(T)-abs(B), abs(R)-abs(L)); f/=length(f)+1e-5; o=vec4(texture(uV,vUv).xy + f*dt*v*C, 0, 1); }');
const pressProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D uP; uniform sampler2D uD; uniform vec2 s; in vec2 vUv; out vec4 o; void main() { float L=texture(uP,vUv-vec2(s.x,0)).x; float R=texture(uP,vUv+vec2(s.x,0)).x; float T=texture(uP,vUv+vec2(0,s.y)).x; float B=texture(uP,vUv-vec2(0,s.y)).x; o=vec4((L+R+T+B-texture(uD,vUv).x)*0.25, 0,0,1); }');
const gradProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D uP; uniform sampler2D uV; uniform vec2 s; in vec2 vUv; out vec4 o; void main() { float L=texture(uP,vUv-vec2(s.x,0)).x; float R=texture(uP,vUv+vec2(s.x,0)).x; float T=texture(uP,vUv+vec2(0,s.y)).x; float B=texture(uP,vUv-vec2(0,s.y)).x; o=vec4(texture(uV,vUv).xy - vec2(R-L,T-B)*0.5, 0, 1); }');
const renderProg = createProg(vsSrc, '#version 300 es\nprecision highp float; uniform sampler2D uD; uniform vec2 s; in vec2 vUv; out vec4 o; void main() { vec3 c=texture(uD,vUv).rgb; float den=length(c); vec3 bg=vec3(0.02, 0.02, 0.1); if(den<0.001) { o=vec4(bg,1); return; } float L=length(texture(uD,vUv-vec2(s.x,0)).rgb); float R=length(texture(uD,vUv+vec2(s.x,0)).rgb); float T=length(texture(uD,vUv+vec2(0,s.y)).rgb); float B=length(texture(uD,vUv-vec2(0,s.y)).rgb); vec3 n=normalize(vec3(L-R, B-T, 0.1)); float d=max(dot(n, normalize(vec3(0.5,0.5,1))), 0.0); o=vec4(c*(d+0.3) + pow(max(dot(vec3(0,0,1),reflect(vec3(-0.5,-0.5,-1),n)),0.0),32.0)*0.5, 1); }');

function createFBO(w, h) {
    gl.activeTexture(gl.TEXTURE0); const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    return { tex, fbo, w, h, attach(id) { gl.activeTexture(gl.TEXTURE0+id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
}
function createDoubleFBO(w, h) {
    let f1 = createFBO(w, h), f2 = createFBO(w, h);
    return { get read() { return f1; }, get write() { return f2; }, swap() { [f1, f2] = [f2, f1]; } };
}

let density, velocity, pressure, divergence, curl;
density = createDoubleFBO(config.DYE_RES, config.DYE_RES);
velocity = createDoubleFBO(config.SIM_RES, config.SIM_RES);
pressure = createDoubleFBO(config.SIM_RES, config.SIM_RES);
divergence = createFBO(config.SIM_RES, config.SIM_RES);
curl = createFBO(config.SIM_RES, config.SIM_RES);

const quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function splat(x, y, dx, dy, color) {
    gl.bindVertexArray(quadVAO); gl.useProgram(splatProg);
    gl.uniform1f(gl.getUniformLocation(splatProg, 'a'), canvas.width/canvas.height);
    gl.uniform2f(gl.getUniformLocation(splatProg, 'p'), x, y);
    gl.uniform1f(gl.getUniformLocation(splatProg, 'r'), config.RADIUS);
    
    gl.viewport(0, 0, velocity.w, velocity.h);
    gl.uniform1i(gl.getUniformLocation(splatProg, 't'), velocity.read.attach(0));
    gl.uniform3f(gl.getUniformLocation(splatProg, 'c'), dx, dy, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();

    gl.viewport(0, 0, density.w, density.h);
    gl.uniform1i(gl.getUniformLocation(splatProg, 't'), density.read.attach(0));
    gl.uniform3f(gl.getUniformLocation(splatProg, 'c'), color.r, color.g, color.b);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();
}

let pointers = [{id:-1, x:0.5, y:0.5, dx:0, dy:0, down:false, moved:false, color:{r:0.1,g:0.8,b:0.3}}];
function genColor() {
    const cs = [{r:0.1,g:0.8,b:0.3},{r:0.8,g:0.1,b:0.5},{r:0.3,g:0.1,b:0.8},{r:0.1,g:0.5,b:0.8},{r:0.8,g:0.6,b:0.1}];
    return cs[Math.floor(Math.random()*cs.length)];
}

function update() {
    resize(); gl.bindVertexArray(quadVAO); gl.disable(gl.BLEND);
    const dt = 0.016;

    gl.viewport(0, 0, curl.w, curl.h); gl.useProgram(curlProg);
    gl.uniform1i(gl.getUniformLocation(curlProg, 'uV'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(curlProg, 's'), 1/velocity.w, 1/velocity.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, curl.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(vortProg);
    gl.uniform1i(gl.getUniformLocation(vortProg, 'uV'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(vortProg, 'uC'), curl.attach(1));
    gl.uniform2f(gl.getUniformLocation(vortProg, 's'), 1/velocity.w, 1/velocity.h);
    gl.uniform1f(gl.getUniformLocation(vortProg, 'dt'), dt);
    gl.uniform1f(gl.getUniformLocation(vortProg, 'v'), config.CURL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();

    gl.viewport(0, 0, velocity.w, velocity.h); gl.useProgram(advectProg);
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uV'), velocity.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uS'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(advectProg, 's'), 1/velocity.w, 1/velocity.h);
    gl.uniform1f(gl.getUniformLocation(advectProg, 'dt'), dt);
    gl.uniform1f(gl.getUniformLocation(advectProg, 'f'), config.V_DISSIPATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();

    gl.viewport(0, 0, density.w, density.h);
    gl.uniform1i(gl.getUniformLocation(advectProg, 'uS'), density.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(advectProg, 's'), 1/density.w, 1/density.h);
    gl.uniform1f(gl.getUniformLocation(advectProg, 'f'), config.D_DISSIPATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); density.swap();

    pointers.forEach(p => { if(p.moved) { splat(p.x, p.y, p.dx, p.dy, p.color); p.moved=false; } });

    gl.viewport(0,0,divergence.w, divergence.h); gl.useProgram(divProg);
    gl.uniform1i(gl.getUniformLocation(divProg, 'uV'), velocity.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(divProg, 's'), 1/velocity.w, 1/velocity.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(pressProg);
    gl.uniform1i(gl.getUniformLocation(pressProg, 'uD'), divergence.attach(0));
    gl.uniform2f(gl.getUniformLocation(pressProg, 's'), 1/velocity.w, 1/velocity.h);
    for(let i=0; i<config.P_ITER; i++) {
        gl.uniform1i(gl.getUniformLocation(pressProg, 'uP'), pressure.read.attach(1));
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); pressure.swap();
    }

    gl.useProgram(gradProg);
    gl.uniform1i(gl.getUniformLocation(gradProg, 'uP'), pressure.read.attach(0));
    gl.uniform1i(gl.getUniformLocation(gradProg, 'uV'), velocity.read.attach(1));
    gl.uniform2f(gl.getUniformLocation(gradProg, 's'), 1/velocity.w, 1/velocity.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); velocity.swap();

    gl.viewport(0,0,canvas.width, canvas.height); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(renderProg);
    gl.uniform1i(gl.getUniformLocation(renderProg, 'uD'), density.read.attach(0));
    gl.uniform2f(gl.getUniformLocation(renderProg, 's'), 1/canvas.width, 1/canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(update);
}

canvas.addEventListener('mousedown', () => { pointers[0].down=true; pointers[0].color=genColor(); });
window.addEventListener('mousemove', e => {
    if(pointers[0].down) {
        let nx=e.clientX/canvas.width, ny=1-e.clientY/canvas.height;
        pointers[0].dx=(nx-pointers[0].x)*5000; pointers[0].dy=(ny-pointers[0].y)*5000;
        pointers[0].x=nx; pointers[0].y=ny; pointers[0].moved=true;
    }
});
window.addEventListener('mouseup', () => pointers[0].down=false);
for(let i=0;i<10;i++) splat(Math.random(), Math.random(), (Math.random()-0.5)*1000, (Math.random()-0.5)*1000, genColor());
requestAnimationFrame(update);
