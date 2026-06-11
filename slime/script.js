/** ASMR Slime - v1.5 Diagnostic **/
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
canvas.width = window.innerWidth; canvas.height = window.innerHeight;

const vs = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vs, '#version 300 es\nin vec2 p; void main(){ gl_Position=vec4(p,0,1); }');
gl.compileShader(vs);

const fs = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fs, '#version 300 es\nprecision highp float; out vec4 o; void main(){ o=vec4(1,1,1,1); }');
gl.compileShader(fs);

const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);

const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5,-0.5, 0.5,-0.5, -0.5,0.5, 0.5,0.5]), gl.STATIC_DRAW);
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

let start = Date.now();
function render() {
    let elapsed = Date.now() - start;
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (elapsed < 1000) {
        gl.clearColor(1, 0, 0, 1); // Rot
        gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
        gl.clearColor(0, 0, 0.2, 1); // Dunkelblau
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Weißes Quadrat
    }
    requestAnimationFrame(render);
}
requestAnimationFrame(render);
console.log('Diagnostic v1.5 running');
window.clearScreen = () => console.log('Clear');
window.randomSplats = () => console.log('Splat');
