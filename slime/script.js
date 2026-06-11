
const canvas = document.getElementById('canvas');
const log = (msg) => { console.log(msg); const d = document.createElement('div'); d.style.color='white'; d.innerText=msg; document.body.appendChild(d); };

log('Starting diagnostic v1.6...');
const gl = canvas.getContext('webgl2', { alpha: false });
if (!gl) {
    log('ERROR: WebGL2 context not created!');
} else {
    log('WebGL2 context OK.');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    log('Canvas size: ' + canvas.width + 'x' + canvas.height);

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, '#version 300 es\nin vec2 p; void main(){ gl_Position=vec4(p,0,1); }');
    gl.compileShader(vs);
    
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, '#version 300 es\nprecision highp float; out vec4 o; void main(){ o=vec4(0,1,0,1); }'); // GRÜN
    gl.compileShader(fs);
    
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW); // Full screen triangle
    
    function render() {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(1, 0, 1, 1); // MAGENTA
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(prog);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
    log('Render loop running. You should see GREEN.');
}
window.clearScreen = () => {}; window.randomSplats = () => {};
